/** Exercise the real useEditor/use-undo hooks without a DOM or external services.
 * This minimal hook host retains React hook slots between explicit renders;
 * effects are intentionally omitted (network hydration and timers are separate).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { require as tsxRequire } from "tsx/cjs/api";

const { useEditor } = tsxRequire("../hooks/useEditor.ts", import.meta.url);

function editorHost(imageId) {
  const slots = [];
  let cursor = 0;
  const dispatcher = {
    useReducer(reducer, initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], (action) => { slots[index] = reducer(slots[index], action); }];
    },
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
      return [slots[index], (value) => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useCallback(callback) { cursor++; return callback; },
    useEffect() { cursor++; },
  };
  return function useRenderEditor() {
    cursor = 0;
    const internals = React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
    const previous = internals.H;
    internals.H = dispatcher;
    try { return useEditor(imageId, { canAutoSave: () => true }); }
    finally { internals.H = previous; }
  };
}

test("mixed edits undo and redo complete snapshots in chronological order", () => {
  const render = editorHost();
  let editor = render();
  const snapshots = [editor.editorState];
  const edits = [
    () => editor.patchAdjustments({ exposure: 24, contrast: 12 }),
    () => editor.commitState({ workingImageUrl: "https://example.com/blur.png", workingWidth: 800, workingHeight: 600 }),
    () => editor.commitState({ transform: { rotation: 90, straighten: 4, flipX: true, flipY: false } }),
    () => editor.commitState({ workingImageUrl: "data:image/png;base64,Y3JvcA==", workingWidth: 300, workingHeight: 200 }),
    () => editor.patchAdjustments({ saturation: -20, shadows: 18 }),
  ];
  for (const edit of edits) { edit(); editor = render(); snapshots.push(editor.editorState); }
  for (let index = snapshots.length - 2; index >= 0; index--) {
    editor.undo(); editor = render(); assert.deepEqual(editor.editorState, snapshots[index]);
  }
  assert.equal(editor.canUndo, false);
  for (const snapshot of snapshots.slice(1)) {
    editor.redo(); editor = render(); assert.deepEqual(editor.editorState, snapshot);
  }
  assert.equal(editor.canRedo, false);
});

test("slider gestures and batched chat patches each use one checkpoint", () => {
  const render = editorHost();
  let editor = render();
  assert.equal(editor.patchAdjustments({ contrast: 0 }), false);
  editor.previewAdjustment("exposure", 0); // unchanged first event must not consume checkpoint
  editor.previewAdjustment("exposure", 5);
  editor.previewAdjustment("exposure", 20);
  editor.updateAdjustment("exposure", 25);
  editor = render();
  assert.equal(editor.adjustments.exposure, 25);
  editor.undo(); editor = render();
  assert.equal(editor.adjustments.exposure, 0);
  assert.equal(editor.canUndo, false);
  editor.redo(); editor = render();
  editor.patchAdjustments({ exposure: 10, contrast: 15, temperature: 8 });
  editor = render(); editor.undo(); editor = render();
  assert.equal(editor.adjustments.exposure, 25);
  assert.equal(editor.adjustments.contrast, 0);
  assert.equal(editor.adjustments.temperature, 0);
});

test("each mask stroke is reversible and a new stroke clears redo", () => {
  const render = editorHost();
  let editor = render();
  const first = { path: "first" }, second = { path: "second" };
  editor.commitState({ masks: { heal: [], eraser: [], blur: [first] } });
  editor = render();
  editor.commitState({ masks: { heal: [], eraser: [], blur: [first, second] } });
  editor = render(); editor.undo(); editor = render();
  assert.deepEqual(editor.editorState.masks.blur, [first]);
  editor.redo(); editor = render();
  assert.deepEqual(editor.editorState.masks.blur, [first, second]);
  editor.undo(); editor = render();
  editor.commitState({ masks: { heal: [second], eraser: [], blur: [] } });
  editor = render(); assert.equal(editor.canRedo, false);
});

test("stale, cancelled and superseded operations cannot apply or create entries", () => {
  const render = editorHost();
  let editor = render();
  const stale = editor.createEditGuard();
  editor.patchAdjustments({ contrast: 10 }); editor = render();
  assert.equal(stale(), false);
  const pending = editor.createEditGuard();
  editor.undo(); editor = render();
  assert.equal(pending(), false);
  const cancelled = editor.createEditGuard();
  editor.createEditGuard(); // cancellation invalidates the pending operation
  assert.equal(cancelled(), false);
  assert.equal(editor.canUndo, false);
  assert.equal(editor.canRedo, true);
  editor.patchAdjustments({ contrast: 11 }); editor = render();
  assert.equal(editor.canRedo, false);
  editor.undo(); editor = render();
  assert.equal(editor.canUndo, false);
});

test("version restore and reset preserve the undo chain", () => {
  const render = editorHost();
  let editor = render();
  editor.patchAdjustments({ exposure: 30 }); editor = render();
  const beforeRestore = editor.editorState;
  editor.restorePersistedState({ ...beforeRestore, workingImageUrl: "https://example.com/version.png" });
  editor = render(); editor.undo(); editor = render();
  assert.deepEqual(editor.editorState, beforeRestore);
  editor.resetAdjustments(); editor = render();
  assert.equal(editor.adjustments.exposure, 0);
  editor.undo(); editor = render();
  assert.equal(editor.adjustments.exposure, 30);
});

test("overlapping saves serialize and stale responses do not replace current pixels", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  const releases = [];
  globalThis.fetch = async (_url, options) => {
    requests.push(JSON.parse(options.body));
    await new Promise((resolve) => releases.push(resolve));
    return { ok: true, json: async () => ({}) };
  };
  try {
    const render = editorHost("image-a");
    let editor = render();
    editor.commitState({ workingImageUrl: "data:image/png;base64,YQ==", workingWidth: 10, workingHeight: 20 });
    editor = render();
    const firstSave = editor.saveVersion(true);
    await Promise.resolve();
    editor.patchAdjustments({ contrast: 40 }); editor = render();
    const secondSave = editor.saveVersion(true);
    assert.equal(requests.length, 1);
    releases.shift()();
    assert.equal(await firstSave, null);
    await Promise.resolve();
    assert.equal(requests.length, 2);
    assert.equal(requests[1].imageBase64, "YQ==");
    assert.equal(requests[1].adjustments.workingImageUrl, null);
    assert.equal(requests[1].adjustments.sliders.contrast, 40);
    releases.shift()(); await secondSave;
    editor = render();
    assert.equal(editor.editorState.workingImageUrl, "data:image/png;base64,YQ==");
    assert.equal(editor.isDirty, false);
  } finally { globalThis.fetch = originalFetch; }
});


test("Agent edits merge into newer manual edits and undo restores the manual state", () => {
  const render = editorHost();
  let editor = render();
  const isCurrent = editor.createChatEditGuard();
  editor.patchAdjustments({ exposure: 15, contrast: 7 });
  editor = render();
  const manual = editor.editorState;
  assert.equal(isCurrent(), true);
  editor.patchAdjustments({ contrast: 25, shadows: -8, blacks: -25 });
  editor = render();
  assert.equal(editor.adjustments.exposure, 15);
  assert.equal(editor.adjustments.contrast, 25);
  editor.undo(); editor = render();
  assert.deepEqual(editor.editorState, manual);
  editor.redo(); editor = render();
  assert.equal(editor.adjustments.contrast, 25);
  const superseded = editor.createChatEditGuard();
  editor.createChatEditGuard();
  assert.equal(superseded(), false);
});
