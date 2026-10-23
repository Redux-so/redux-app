import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { require as tsxRequire } from "tsx/cjs/api";

const { loadDecodedImage, prefetchDecodedImage } = tsxRequire("../lib/decoded-image-cache.ts", import.meta.url);
const { rememberLibraryView, recallLibraryView, restoreLibraryPages } = tsxRequire("../lib/library-view-cache.ts", import.meta.url);

test("rapid slider updates render only the latest frame and reuse the Fabric preview", () => {
  const file = ts.createSourceFile("useCanvas.ts", readFileSync(new URL("../hooks/useCanvas.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
  let effect;
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(file) === "useLayoutEffect" &&
      node.arguments[0].getText(file).includes("renderInteractiveImage")) effect = node.arguments[0].getText(file);
    ts.forEachChild(node, visit);
  }
  visit(file);
  assert.ok(effect, "exercise the real canvas preview effect");
  const compiled = ts.transpileModule(`const effect = ${effect};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  let allocations = 0, renders = 0, lastAdjustments;
  class Preview {
    constructor(element) { this.element = element; allocations++; }
    getElement() { return this.element; }
  }
  const source = new Preview({ naturalWidth: 2000, naturalHeight: 1500 });
  const frames = new Map();
  let nextFrame = 0;
  const rendered = {};
  const context = {
    fabricRef: { current: {} }, sourceImageRef: { current: source }, canvasReady: true,
    localPreviewCanvasRef: { current: null }, bgImageRef: { current: source }, adjustments: {},
    requestAnimationFrame(callback) { frames.set(++nextFrame, callback); return nextFrame; },
    cancelAnimationFrame(id) { frames.delete(id); },
    renderInteractiveImage(_source, adjustments) { renders++; lastAdjustments = adjustments; return rendered; },
    relayoutCanvas() {}, setPreviewError(error) { assert.equal(error, null); },
  };
  const run = vm.runInNewContext(`${compiled}\neffect;`, context);
  let cleanup;
  for (let value = 1; value <= 100; value++) {
    cleanup?.();
    context.adjustments = { temperature: value };
    cleanup = run();
  }
  assert.equal(renders, 0, "slider commits must not synchronously render pixels");
  assert.equal(frames.size, 1);
  for (const callback of frames.values()) callback();
  frames.clear();
  assert.equal(renders, 1);
  assert.equal(lastAdjustments.temperature, 100);
  const preview = context.bgImageRef.current;
  cleanup = run();
  for (const callback of frames.values()) callback();
  frames.clear();
  assert.equal(context.bgImageRef.current, preview);
  assert.equal(allocations, 2, "one source and one reusable preview");
  cleanup = run();
  cleanup();
  assert.equal(frames.size, 0, "unmount cancels pending rendering");
});

test("image decoding is shared, failures retry, and speculative downloads are serialized", async () => {
  const originalImage = globalThis.Image;
  const pending = [];
  globalThis.Image = class {
    naturalWidth = 4000;
    naturalHeight = 3000;
    decode() { return new Promise((resolve, reject) => pending.push({ image: this, resolve, reject })); }
  };
  try {
    const first = loadDecodedImage("source-a");
    assert.equal(loadDecodedImage("source-a"), first);
    assert.equal(pending.length, 1);
    assert.equal(pending[0].image.crossOrigin, "anonymous");
    pending[0].resolve();
    assert.equal(await first, pending[0].image);
    const failed = loadDecodedImage("source-failed");
    pending[1].reject(new Error("offline"));
    await assert.rejects(failed, /offline/);
    const retried = loadDecodedImage("source-failed");
    pending[2].resolve(); await retried;
    prefetchDecodedImage("warm-a");
    prefetchDecodedImage("warm-b");
    assert.equal(pending.length, 4, "only one speculative download may run");
    pending[3].resolve();
    await new Promise((resolve) => setImmediate(resolve));
    prefetchDecodedImage("warm-b");
    assert.equal(pending.length, 5);
    pending[4].resolve();
    await new Promise((resolve) => setImmediate(resolve));
  } finally { globalThis.Image = originalImage; }
});

test("decoded image cache evicts oversized images instead of retaining unbounded pixels", async () => {
  const originalImage = globalThis.Image;
  let decodes = 0;
  globalThis.Image = class {
    naturalWidth = 10000;
    naturalHeight = 5000;
    async decode() { decodes++; }
  };
  try {
    await loadDecodedImage("oversized-image");
    await loadDecodedImage("oversized-image");
    assert.equal(decodes, 2);
  } finally { globalThis.Image = originalImage; }
});

test("decoded source cache keeps only the two most recently used images", async () => {
  const originalImage = globalThis.Image;
  let decodes = 0;
  globalThis.Image = class {
    naturalWidth = 100;
    naturalHeight = 100;
    async decode() { decodes++; }
  };
  try {
    await loadDecodedImage("lru-a");
    await loadDecodedImage("lru-b");
    await loadDecodedImage("lru-a");
    await loadDecodedImage("lru-c");
    await loadDecodedImage("lru-a");
    assert.equal(decodes, 3);
    await loadDecodedImage("lru-b");
    assert.equal(decodes, 4);
  } finally { globalThis.Image = originalImage; }
});

test("repeated previews reuse the backing canvas and clear previous pixels", () => {
  const originalDocument = globalThis.document;
  class Canvas {
    w = 0; h = 0; resizes = 0; clears = 0;
    get width() { return this.w; }
    set width(value) { this.w = value; this.resizes++; }
    get height() { return this.h; }
    set height(value) { this.h = value; this.resizes++; }
    getContext() { return {
      clearRect: () => { this.clears++; }, drawImage() {},
      getImageData: () => ({ data: new Uint8ClampedArray(this.w * this.h * 4).fill(255) }),
    }; }
  }
  globalThis.document = { createElement: () => new Canvas() };
  try {
    const { renderInteractiveImage } = tsxRequire("../lib/interactive-image-preview.ts", import.meta.url);
    const source = { naturalWidth: 2, naturalHeight: 2 };
    const target = new Canvas();
    renderInteractiveImage(source, {}, target);
    assert.equal(target.resizes, 2);
    renderInteractiveImage(source, { exposure: 10 }, target);
    assert.equal(target.resizes, 2, "slider changes must not reallocate the same-sized backing canvas");
    assert.equal(target.clears, 2, "transparent source pixels must never retain a previous preview");
  } finally { globalThis.document = originalDocument; }
});

test("library view cache is account-scoped, expiring, bounded and preserves scroll", () => {
  const originalWindow = globalThis.window, originalNow = Date.now;
  globalThis.window = {};
  let now = 1000;
  Date.now = () => now;
  try {
    const view = { images: [{ id: "photo-a" }], trashedImages: [], scrollTop: 1200 };
    rememberLibraryView("account-a", view);
    assert.equal(recallLibraryView("account-a").scrollTop, 1200);
    assert.equal(recallLibraryView("account-b"), null);
    now += 5 * 60_000 + 1;
    assert.equal(recallLibraryView("account-a"), null);
    rememberLibraryView("account-a", { ...view, images: Array(1001).fill(view.images[0]) });
    assert.equal(recallLibraryView("account-a"), null);
  } finally { globalThis.window = originalWindow; Date.now = originalNow; }
});

test("library restoration keeps later pages but fresh server records and membership win", () => {
  const previous = [{ id: "a", previewUrl: "old" }, { id: "b" }, { id: "c" }];
  const fresh = { images: [{ id: "a", previewUrl: "new" }, { id: "b" }], total: 4 };
  const restored = restoreLibraryPages(previous, 4, 2, fresh);
  assert.deepEqual(restored.images.map((image) => image.id), ["a", "b", "c"]);
  assert.equal(restored.images[0].previewUrl, "new");
  assert.equal(restored.page, 2);
  for (const changed of [{ images: [{ id: "new-upload" }], total: 4 }, { ...fresh, total: 3 }]) {
    assert.deepEqual(restoreLibraryPages(previous, 4, 2, changed), { images: changed.images, page: 1 });
  }
});

test("late saved-cover events update a restored library without refetching or dropping pages", () => {
  const originalWindow = globalThis.window, originalStorage = globalThis.sessionStorage;
  globalThis.window = new EventTarget();
  const storage = new Map();
  globalThis.sessionStorage = { getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) };
  const sync = tsxRequire("../lib/library-preview-sync.ts", import.meta.url);
  try {
    const initialLibrary = { images: [{ id: "late-cover-a", previewUrl: "server-cover" }], total: 2 };
    const initialTrash = { images: [], total: 0 };
    const previous = { images: [...initialLibrary.images, { id: "late-cover-b", previewUrl: "old-cover" }],
      trashedImages: [], libraryPage: 2, trashPage: 1, libraryTotal: 2, trashTotal: 0,
      albums: [], filters: {}, sidebarView: { kind: "all" }, scrollTop: 900 };
    rememberLibraryView("late-cover-account", previous);
    const file = ts.createSourceFile("LibraryPageClient.tsx", readFileSync(new URL("../app/(dashboard)/library/LibraryPageClient.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const effects = [];
    function visit(node) {
      if (ts.isCallExpression(node) && node.expression.getText(file) === "useLayoutEffect") effects.push(node.arguments[0].getText(file));
      ts.forEachChild(node, visit);
    }
    visit(file);
    const state = { images: initialLibrary.images, trashedImages: [], libraryPage: 1 };
    const frames = new Map();
    const context = { ...sync, recallLibraryView, restoreLibraryPages, initialLibrary, initialTrash,
      ownerId: "late-cover-account", mainScrollRef: { current: { scrollTop: 0 } }, previewUpdatesRef: { current: {} },
      window: globalThis.window,
      requestAnimationFrame(callback) { frames.set(1, callback); return 1; },
      cancelAnimationFrame(id) { frames.delete(id); },
      fetch() { assert.fail("cover updates should not refetch either photo list"); },
    };
    for (const key of ["images", "trashedImages", "libraryPage", "trashPage", "libraryTotal", "trashTotal", "albums", "filters", "sidebarView"]) {
      context[`set${key[0].toUpperCase()}${key.slice(1)}`] = (value) => { state[key] = typeof value === "function" ? value(state[key]) : value; };
    }
    const cleanups = effects.map((effect) => {
      const compiled = ts.transpileModule(`const effect = ${effect};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
      return vm.runInNewContext(`(() => { ${compiled}\nreturn effect(); })()`, context);
    });
    for (const frame of frames.values()) frame();
    assert.equal(context.mainScrollRef.current.scrollTop, 900);
    sync.recordLibraryPreviewUpdate("late-cover-b", "new-cover", 42);
    assert.equal(state.images.length, 2);
    assert.equal(state.libraryPage, 2);
    assert.equal(state.images[1].previewUrl, "new-cover");
    for (const cleanup of cleanups) cleanup?.();
  } finally { globalThis.window = originalWindow; globalThis.sessionStorage = originalStorage; }
});
