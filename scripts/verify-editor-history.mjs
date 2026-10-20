/** Exercise the real useEditor hook without a DOM or external services.
 * This minimal hook host retains React hook slots between explicit renders;
 * effects are intentionally omitted (network hydration and timers are separate).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { require as tsxRequire } from "tsx/cjs/api";

const { useEditor } = tsxRequire("../hooks/useEditor.ts", import.meta.url);

function editorHost(imageId, options = {}) {
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
    try { return useEditor(imageId, { canAutoSave: () => true, ...options }); }
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
    assert.deepEqual(requests[1].historyImages, ["YQ=="]);
    assert.equal(requests[1].adjustments.workingImageUrl, "history-image:0");
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


test("export reads the completed document after pending operations and rejects draft masks", async () => {
  const render = editorHost();
  let editor = render();
  const finish = editor.beginOperation();
  const exporting = editor.prepareExportState();
  editor.commitState({ workingImageUrl: "https://example.com/completed.png", workingWidth: 10, workingHeight: 20 });
  editor.patchAdjustments({ exposure: 19 });
  finish();
  const snapshot = await exporting;
  assert.equal(snapshot.workingImageUrl, "https://example.com/completed.png");
  assert.equal(snapshot.sliders.exposure, 19);
  editor = render();
  editor.commitState({ masks: { heal: [], eraser: [], blur: [{ path: "draft" }] } });
  await assert.rejects(editor.prepareExportState(), /Confirm or cancel/);
});


test("saved covers use the exact persisted snapshot across editor reopenings", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    requests.push(body);
    return { ok: true, json: async () => ({}) };
  };
  try {
    for (const temperature of [70, -50]) {
      const render = editorHost("image-cover", {
        renderCover: async (state) => Buffer.from(JSON.stringify(state)).toString("base64"),
      });
      let editor = render();
      editor.patchAdjustments({ temperature, grain: 20 });
      editor.commitState({ workingImageUrl: "data:image/png;base64,Y3JvcA==", workingWidth: 200, workingHeight: 100,
        transform: { rotation: 90, straighten: 4, flipX: true, flipY: false } });
      editor = render();
      assert.ok(await editor.saveVersion(true));
      const request = requests.at(-1);
      const coverState = JSON.parse(Buffer.from(request.coverBase64, "base64").toString());
      assert.deepEqual(coverState.sliders, request.adjustments.sliders);
      assert.deepEqual(coverState.transform, request.adjustments.transform);
      assert.equal(coverState.workingImageUrl, "data:image/png;base64,Y3JvcA==");
      assert.deepEqual(request.historyImages, ["Y3JvcA=="]);
      assert.equal(request.adjustments.workingImageUrl, "history-image:0");
    }
    assert.ok(requests[1].saveGeneration > requests[0].saveGeneration);
  } finally { globalThis.fetch = originalFetch; }
});

test("failed cover rendering leaves edits dirty and does not publish a version", async () => {
  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  let requests = 0;
  globalThis.fetch = async () => { requests++; throw new Error("Unexpected request"); };
  console.error = () => {};
  try {
    const render = editorHost("image-cover", { renderCover: async () => { throw new Error("render failed"); } });
    let editor = render();
    editor.patchAdjustments({ temperature: 80 }); editor = render();
    assert.equal(await editor.saveVersion(true), null);
    assert.equal(requests, 0);
    assert.equal(render().isDirty, true);
  } finally { globalThis.fetch = originalFetch; console.error = originalError; }
});


test("reverting keeps the version line and later edits continue from the reverted pixels", () => {
  const render = editorHost();
  let editor = render();
  editor.updateAdjustment("temperature", 45); editor = render();
  const warm = editor.editorState;
  const warmId = editor.currentHistoryId;
  editor.updateAdjustment("contrast", 25); editor = render();
  const contrast = editor.editorState;
  const contrastId = editor.currentHistoryId;
  editor.restorePersistedState(warm, "Reverted to Version 1"); editor = render();
  assert.equal(editor.adjustments.contrast, 0);
  assert.equal(editor.adjustments.temperature, 45);
  assert.equal(editor.historyEntries.length, 4);
  assert.ok(editor.historyEntries.some((entry) => entry.id === contrastId));
  editor.updateAdjustment("grain", 15); editor = render();
  const grainId = editor.currentHistoryId;
  assert.ok(editor.historyEntries.some((entry) => entry.id === warmId));
  assert.ok(editor.historyEntries.some((entry) => entry.id === contrastId));
  // Reverting while toolbar undo is positioned earlier also keeps all versions.
  editor.selectHistory(warmId); editor = render();
  editor.restorePersistedState(contrast, "Reverted to Version 2"); editor = render();
  assert.equal(editor.adjustments.contrast, 25);
  assert.ok(editor.historyEntries.some((entry) => entry.id === grainId));
  editor.undo(); editor = render();
  assert.equal(editor.adjustments.grain, 15);
});

test("slider drags create one visible entry; masks stay out of saved actions", async () => {
  const originalFetch = globalThis.fetch;
  let payload;
  globalThis.fetch = async (_url, options) => { payload = JSON.parse(options.body); return { ok: true, json: async () => ({}) }; };
  try {
    const render = editorHost("image-a");
    let editor = render();
    editor.previewAdjustment("temperature", 10); editor.previewAdjustment("temperature", 20);
    editor.updateAdjustment("temperature", 30); editor = render();
    assert.deepEqual(editor.historyEntries.map((entry) => entry.label), ["Original", "Temperature adjusted"]);
    editor.commitState({ masks: { heal: [{ path: "draft" }], blur: [], eraser: [] } }); editor = render();
    assert.equal(editor.historyEntries.length, 2);
    await editor.saveVersion(true);
    assert.equal(payload.history.entries.length, 2);
    assert.equal(payload.history.entries[1].state.masks, undefined);
    assert.equal(payload.history.entries[1].state.sliders.temperature, 30);
  } finally { globalThis.fetch = originalFetch; }
});

test("legacy checkpoints restore their saved pixels; modern snapshots retain the original source", () => {
  const { normalizeSavedVersion, parseEditorTimeline } = tsxRequire("../lib/editor-history.ts", import.meta.url);
  const original = "https://example.com/original.png", result = "https://example.com/healed.png";
  const recovered = normalizeSavedVersion({}, result, original);
  assert.equal(recovered.workingImageUrl, result);
  const timeline = parseEditorTimeline(recovered);
  assert.deepEqual(timeline.entries.map((entry) => entry.label), ["Original", "Previous edits"]);
  assert.equal(timeline.entries[1].state.workingImageUrl, result);
  const modern = normalizeSavedVersion({ v: 2, sliders: {}, workingImageUrl: null }, result, original);
  assert.equal(modern.workingImageUrl, null);
});

test("a slider gesture returning to its starting value leaves no action", () => {
  const render = editorHost();
  let editor = render();
  editor.previewAdjustment("temperature", 50);
  editor.previewAdjustment("temperature", 0);
  editor.updateAdjustment("temperature", 0);
  editor = render();
  assert.equal(editor.historyEntries.length, 1);
  assert.equal(editor.currentHistoryId, "original");
});
