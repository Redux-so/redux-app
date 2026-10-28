/** Real component handlers and generated CSS; no account, billing or remote service calls. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import { require as tsxRequire } from "tsx/cjs/api";

const nativeRequire = createRequire(import.meta.url);
const load = (path) => tsxRequire(path, import.meta.url);
const { defaultPersistedEditorState } = load("../lib/editor-state.ts");
const { pinchViewport } = load("../lib/editor-viewport.ts");
const noop = () => {};
function placeholder(name) {
  const component = () => null;
  Object.defineProperty(component, "name", { value: name });
  return { default: component, Icon: component, LoadingOverlay: component, LoadingSpinner: component, RetouchSlider: component };
}
function compile(path, adapters = {}, expose = "") {
  const mod = { exports: {} };
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(`${code}\n${expose}`, { module: mod, exports: mod.exports, console, ...adapters.__globals,
    require: (id) => adapters[id] ?? (id === "next/dynamic" ? { default: () => placeholder("Dynamic").default }
      : id.startsWith("@/components/") || id.startsWith(".") ? placeholder(id.split("/").at(-1))
      : id.startsWith("@/") ? load(`../${id.slice(2)}`) : nativeRequire(id)),
  });
  return mod.exports;
}
function host(component, initialProps) {
  const slots = [];
  let cursor = 0;
  const dispatcher = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
      return [slots[index], (value) => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }];
    },
    useRef(initial) { const index = cursor++; return slots[index] ??= { current: initial }; },
    useCallback(callback) { cursor++; return callback; },
    useMemo(factory) { cursor++; return factory(); },
    useEffect() { cursor++; }, useLayoutEffect() { cursor++; },
    useImperativeHandle(ref, factory) { cursor++; if (ref) ref.current = factory(); },
  };
  let props = initialProps;
  return { render(nextProps) {
    if (nextProps) props = { ...props, ...nextProps };
    cursor = 0;
    const internals = React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
    const previous = internals.H; internals.H = dispatcher;
    try { return component(props); } finally { internals.H = previous; }
  } };
}
function find(node, predicate) {
  if (!node || typeof node !== "object") return undefined;
  if (Array.isArray(node)) return node.map((child) => find(child, predicate)).find(Boolean);
  return predicate(node) ? node : find(node.props?.children, predicate);
}

function findAll(node, predicate) {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap((child) => findAll(child, predicate));
  return [...(predicate(node) ? [node] : []), ...findAll(node.props?.children, predicate)];
}

test("HTTP phone sessions create valid history IDs without crypto.randomUUID", () => {
  const { webcrypto } = nativeRequire("node:crypto");
  const { createUuid } = compile("../lib/create-uuid.ts", {
    __globals: { crypto: { getRandomValues: (array) => webcrypto.getRandomValues(array) } },
  });
  const ids = new Set(Array.from({ length: 200 }, createUuid));
  assert.equal(ids.size, 200);
  for (const id of ids) assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  const history = compile("../lib/editor-history.ts", { "@/lib/create-uuid": { createUuid } });
  let timeline = history.createEditorTimeline();
  for (const key of Object.keys(defaultPersistedEditorState().sliders)) {
    const previous = timeline.entries[timeline.cursor].state;
    timeline = history.appendEditorHistory(timeline, { ...previous, sliders: { ...previous.sliders, [key]: 15 } }, true);
    assert.equal(timeline.entries[timeline.cursor].state.sliders[key], 15);
  }
  const restored = history.parseEditorTimeline({ ...load("../lib/editor-state.ts").serializePersistedEditorState(timeline.entries[timeline.cursor].state), history: history.serializeEditorTimeline(timeline) });
  assert.equal(restored.entries.length, timeline.entries.length);
  assert.equal(restored.cursor, timeline.cursor);
});

test("every light, color and effects slider routes touch changes and commits to the editor", () => {
  const Panel = compile("../components/editor/AdjustmentPanel.tsx").default;
  const previews = [], commits = [];
  const panel = host(Panel, { adjustments: defaultPersistedEditorState().sliders,
    onPreview: (key, value) => previews.push([key, value]), onCommit: (key, value) => commits.push([key, value]),
    restoredMaskTool: null, createEditGuard: () => () => true, beginOperation: () => noop,
    brushSizes: { blur: 20, heal: 20, eraser: 20 }, setBrushSize: noop,
    history: { entries: [], versions: [], ready: true }, mobileLayout: true, mobileVisible: true });
  for (const title of ["Light adjustments", "Color adjustments", "Effects adjustments"]) {
    find(panel.render(), (node) => node.props?.title === title).props.onClick();
    const sliders = findAll(panel.render(), (node) => node.type?.name === "AdjustmentSlider");
    assert.ok(sliders.length > 0);
    for (const slider of sliders) {
      assert.notEqual(slider.props.disabled, true);
      const value = slider.props.max === 0 ? -15 : 15;
      slider.props.onChange(value); slider.props.onCommit(value);
      if (["Sharpen", "Vignette", "Grain"].includes(slider.props.label)) assert.equal(slider.props.min, 0);
      if (slider.props.label === "Noise Reduction") assert.equal(slider.props.max, 0);
    }
  }
  assert.equal(previews.length, Object.keys(defaultPersistedEditorState().sliders).length);
  assert.deepEqual(previews, commits);
});

test("blur, eraser and heal brush size controls remain interactive on touch", () => {
  const BrushControls = compile("../components/editor/RetouchBrushControls.tsx").default;
  for (const tool of ["blur", "eraser", "heal"]) {
    let size = 20;
    const tree = BrushControls({ tool, size, onSizeChange: (value) => { size = value; }, loading: false });
    const slider = find(tree, (node) => node.props?.label === "Brush size");
    assert.equal(slider.props.disabled, false);
    slider.props.onChange(75);
    assert.equal(size, 75);
  }
});

test("mobile transform buttons, angle slider and resize fields accept interaction", () => {
  const Panel = compile("../components/editor/AdjustmentPanel.tsx").default;
  const events = [];
  const panel = host(Panel, { adjustments: defaultPersistedEditorState().sliders,
    onPreview: noop, onCommit: noop, restoredMaskTool: null, createEditGuard: () => () => true, beginOperation: () => noop,
    brushSizes: { blur: 20, heal: 20, eraser: 20 }, setBrushSize: noop,
    history: { entries: [], versions: [], ready: true }, mobileLayout: true, mobileVisible: true,
    imageWidth: 1200, imageHeight: 800,
    onToggleCrop: () => events.push("crop"), onRotateCW: () => events.push("rotate"),
    onStraighten: (value) => events.push(["angle", value]), onStraightenCommit: (value) => events.push(["commit", value]),
    onResize: (width, height) => events.push(["resize", width, height]),
  });
  find(panel.render(), (node) => node.props?.title === "Crop and geometry").props.onClick();
  for (const label of ["Crop", "Rotate", "Straighten"]) {
    find(panel.render(), (node) => node.props?.label === label).props.onClick();
  }
  const angle = find(panel.render(), (node) => node.props?.label === "Angle");
  angle.props.onChange(5); angle.props.onCommit(5);
  find(panel.render(), (node) => node.props?.label === "Resize").props.onClick();
  const input = (id) => find(panel.render(), (node) => node.props?.id === id);
  input("editor-resize-width").props.onChange({ target: { value: "900" } });
  assert.equal(input("editor-resize-height").props.value, "600");
  find(panel.render(), (node) => node.props?.title === "Unlock aspect ratio").props.onClick();
  input("editor-resize-height").props.onChange({ target: { value: "500" } });
  find(panel.render(), (node) => node.type === "button" && node.props.children === "Apply").props.onClick();
  assert.deepEqual(events, ["crop", "rotate", ["angle", 5], ["commit", 5], ["resize", 900, 500]]);
});

test("chat mode and model menus open, stay inside the keyboard viewport, and accept selections", () => {
  const viewport = { offsetLeft: 0, offsetTop: 20, width: 320, height: 340 };
  const window = { innerWidth: 320, innerHeight: 800, visualViewport: viewport };
  const position = compile("../lib/chat-popover-position.ts", { __globals: { window } });
  const { ChatModelSelector, ChatInteractionModeSelector } = compile("../components/editor/ChatPanel.tsx", {
    "@/constants/brand": { BRAND_LOGO_IMAGE: { src: "/logo.png" } },
    "@/lib/chat-popover-position": position,
    "@/lib/popup-motion": { usePopupMotion: () => ({}) },
    "react-dom": { createPortal: (children) => children },
    "framer-motion": { ...nativeRequire("framer-motion"), useReducedMotion: () => true },
    __globals: { window, document: { body: {} } },
  }, "exports.ChatModelSelector = ChatModelSelector; exports.ChatInteractionModeSelector = ChatInteractionModeSelector;");
  for (const Selector of [ChatModelSelector, ChatInteractionModeSelector]) {
    let mode;
    const menu = host(Selector, { mode: "agent", onModeChange: (value) => { mode = value; } });
    const trigger = () => find(menu.render(), (node) => node.props?.["aria-haspopup"] === "menu");
    trigger().props.ref.current = { getBoundingClientRect: () => ({ top: 290, bottom: 322, left: 290, width: 45 }) };
    trigger().props.onClick();
    assert.equal(trigger().props["aria-expanded"], true);
    const list = find(menu.render(), (node) => node.props?.role === "menu");
    assert.ok(list.props.style.top >= 28);
    assert.ok(list.props.style.left + list.props.style.width <= 312);
    const options = findAll(list, (node) => node.type === "button" && !node.props.disabled && node.props.onClick);
    assert.ok(options.length > 0);
    options.at(-1).props.onClick();
    assert.equal(trigger().props["aria-expanded"], false);
    if (Selector === ChatInteractionModeSelector) assert.equal(mode, "ask");
  }
});

test("touch photo controls reveal on tap, ignore actions, and dismiss outside without closing inside album portals", () => {
  let visible = false;
  let touch = true;
  let cleanup;
  const listeners = new Map();
  class Element {
    constructor(kind = "image", owner = null) { this.kind = kind; this.owner = owner; }
    closest(selector) {
      if (selector === "[data-photo-card-owner]") return this.owner ? this : null;
      return this.kind === "button" ? this : null;
    }
    getAttribute() { return this.owner; }
  }
  const photo = new Element();
  const ref = { current: { contains: (target) => target === photo || target.kind === "button" } };
  const { usePhotoCardControls } = compile("../hooks/usePhotoCardControls.ts", {
    react: {
      useState: () => [visible, (next) => { visible = typeof next === "function" ? next(visible) : next; }],
      useRef: () => ref,
      useEffect: (effect) => { cleanup?.(); cleanup = effect(); },
    },
    __globals: {
      Element,
      window: { matchMedia: () => ({ matches: touch }) },
      document: {
        addEventListener: (name, listener) => listeners.set(name, listener),
        removeEventListener: (name) => listeners.delete(name),
      },
    },
  });
  let controls = usePhotoCardControls("photo-1");
  assert.equal(controls["data-controls-visible"], false);
  controls.onClick({ target: photo });
  controls = usePhotoCardControls("photo-1");
  assert.equal(controls["data-controls-visible"], true);
  controls.onClick({ target: new Element("button") });
  assert.equal(visible, true);
  listeners.get("pointerdown")({ target: new Element("dialog", "photo-1") });
  assert.equal(visible, true, "portaled album options belong to the selected photo");
  listeners.get("pointerdown")({ target: new Element("image") });
  assert.equal(visible, false, "another card or empty space dismisses controls");
  controls = usePhotoCardControls("photo-1");
  assert.equal(listeners.size, 0, "inactive cards have no document listeners");
  controls.onClick({ target: photo });
  controls = usePhotoCardControls("photo-1");
  controls.onClick({ target: photo });
  assert.equal(visible, false, "tapping the photo again hides controls");
  touch = false;
  controls.onClick({ target: photo });
  assert.equal(visible, false, "desktop keeps hover behavior");
  cleanup?.();
});

test("mobile album selection is portaled above cards with explicit close and desktop dropdown preserved", () => {
  const Dialog = nativeRequire("@radix-ui/react-dialog");
  let mobile = true;
  const Menu = compile("../components/library/PhotoCardAlbumMenu.tsx", {
    "@/hooks/useMobileLayout": { useMobileLayout: () => mobile },
  }).default;
  const app = host(Menu, { imageId: "photo-1", albums: [{ id: "album-1", name: "Vacation" }],
    memberAlbumIds: new Set(["album-1"]), onAlbumMembershipChange: noop });
  find(app.render(), (node) => node.props?.["aria-label"] === "Photo options").props.onClick({ stopPropagation: noop });
  let tree = app.render();
  const root = find(tree, (node) => node.type === Dialog.Root);
  assert.equal(root.props.open, true);
  assert.ok(find(tree, (node) => node.type === Dialog.Portal));
  assert.ok(find(tree, (node) => node.type === Dialog.Overlay));
  assert.ok(find(tree, (node) => node.type === Dialog.Close && node.props["aria-label"] === "Close album menu"));
  const content = find(tree, (node) => node.type === Dialog.Content);
  assert.equal(content.props["data-photo-card-owner"], "photo-1");
  assert.equal(find(content, (node) => node.props?.role === "checkbox").props["aria-checked"], true);
  root.props.onOpenChange(false);
  assert.equal(find(app.render(), (node) => node.type === Dialog.Root).props.open, false);
  mobile = false;
  tree = app.render();
  assert.equal(find(tree, (node) => node.type === Dialog.Portal), undefined);
  find(tree, (node) => node.props?.["aria-label"] === "Photo options").props.onClick({ stopPropagation: noop });
  assert.ok(find(app.render(), (node) => node.props?.className?.includes("photo-card-album-menu absolute")));
});

test("mobile tools open one panel, reopen hidden sections, and preserve desktop toggle behavior", () => {
  const Panel = compile("../components/editor/AdjustmentPanel.tsx").default;
  const events = [], controls = { current: null };
  const props = { adjustments: defaultPersistedEditorState().sliders, onPreview: noop, onCommit: noop,
    restoredMaskTool: null, createEditGuard: () => () => true, beginOperation: () => noop,
    brushSizes: { blur: 20, heal: 20, eraser: 20 }, setBrushSize: noop,
    history: { entries: [], versions: [], ready: true }, chatControlsRef: controls,
    mobileLayout: true, mobileVisible: false, onMobilePanelChange: (open) => events.push(open) };
  const panel = host(Panel, props);
  const light = () => find(panel.render(), (node) => node.props?.title === "Light adjustments");
  light().props.onClick();
  assert.equal(events.at(-1), true);
  panel.render({ mobileVisible: true });
  assert.equal(light().props.active, true);
  find(panel.render(), (node) => node.props?.["aria-label"] === "Close adjustments").props.onClick();
  panel.render({ mobileVisible: false });
  assert.equal(light().props.active, false);
  light().props.onClick();
  assert.equal(events.at(-1), true, "returning from Chat reopens the same section");
  panel.render({ mobileVisible: true });
  light().props.onClick();
  assert.equal(events.at(-1), false);
  controls.current.openBrush("blur", 40, 20);
  assert.equal(events.at(-1), true, "Agent brush requests reveal the retouch controls");
  panel.render({ mobileLayout: false });
  light().props.onClick();
  assert.equal(light().props.active, true);
  light().props.onClick();
  assert.equal(light().props.active, false);
});

test("switching mobile editor panels retains the same canvas and mounted chat", () => {
  const state = defaultPersistedEditorState(), canvasRef = { current: null };
  const editor = { editorState: state, adjustments: state.sliders, historyEntries: [], savedVersions: [], versionLoaded: true,
    getEditorState: () => state, createEditGuard: () => () => true, createChatEditGuard: () => () => true };
  const { EditorWorkspace } = compile("../components/editor/EditorApp.tsx", {
    "next/navigation": { useSearchParams: () => new URLSearchParams() },
    "@/hooks/useMobileLayout": { useMobileLayout: () => true },
    "@/hooks/useEditor": { useEditor: () => editor },
    "@/hooks/useCanvas": { useCanvas: () => ({ canvasRef, activeImageUrl: "test.png", brushSizes: { blur: 20, heal: 20, eraser: 20 } }) },
    "@/hooks/useEditorChatTools": { useEditorChatTools: () => ({}) },
  }, "exports.EditorWorkspace = EditorWorkspace;");
  const app = host(EditorWorkspace, { imageId: "photo-a" });
  const panel = () => find(app.render(), (node) => node.type?.name === "AdjustmentPanel");
  const canvas = () => find(app.render(), (node) => node.type?.name === "Canvas");
  const chat = () => find(app.render(), (node) => typeof node.props?.onMobileClose === "function");
  assert.equal(find(app.render(), (node) => node.props?.className?.includes("editor-workspace")).props["data-mobile-panel"], "none");
  const originalChatType = chat().type;
  panel().props.onMobilePanelChange(true);
  assert.equal(find(app.render(), (node) => node.props?.className?.includes("editor-workspace")).props["data-mobile-panel"], "adjustments");
  assert.equal(canvas().props.canvasRef, canvasRef);
  assert.equal(chat().type, originalChatType);
  panel().props.onMobileChatToggle();
  assert.equal(panel().props.mobileChatActive, true);
  chat().props.onMobileClose();
  assert.equal(find(app.render(), (node) => node.props?.className?.includes("editor-workspace")).props["data-mobile-panel"], "none");
  assert.equal(canvas().props.canvasRef, canvasRef);
  assert.ok(chat());
});

test("mobile library navigation makes the background inert and selecting a view closes the drawer", () => {
  const Library = compile("../app/(dashboard)/library/LibraryPageClient.tsx", {
    "@/hooks/useMobileLayout": { useMobileLayout: () => true },
    "@/hooks/useImageUpload": { useImageUpload: () => ({ isBusy: false, uploadFiles: noop }) },
    "@/hooks/useInfiniteScrollSentinel": { useInfiniteScrollSentinel: () => ({ current: null }) },
  }).default;
  const app = host(Library, { ownerId: "account-a", initialLibrary: { images: [], total: 0 }, initialTrash: { images: [], total: 0 } });
  const drawer = () => find(app.render(), (node) => node.type?.name === "MobileLibraryNavigation");
  drawer().props.onOpenChange(true);
  assert.equal(drawer().props.open, true);
  assert.ok(find(app.render(), (node) => node.props?.inert === true));
  find(drawer().props.children, (node) => node.type?.name === "LibrarySidebar").props.onSidebarViewChange({ kind: "trash" });
  assert.equal(drawer().props.open, false);
  assert.equal(find(app.render(), (node) => node.props?.inert === true), undefined);
  assert.ok(find(app.render(), (node) => node.type?.name === "TrashViewToolbar"));
});

test("mobile filters use a centered dialog with explicit close, focus return, and unchanged apply behavior", () => {
  const { DEFAULT_LIBRARY_FILTERS } = load("../lib/library-filters.ts");
  let closes = 0, applies = 0, focused = 0, draft;
  const props = { open: true, draft: DEFAULT_LIBRARY_FILTERS, applied: DEFAULT_LIBRARY_FILTERS,
    containerRef: { current: { querySelector: () => ({ focus: () => { focused++; } }) } },
    onDraftChange: (next) => { draft = next; }, onApply: () => { applies++; }, onClearAll: noop,
    onClose: () => { closes++; } };
  const Filters = compile("../components/library/LibraryFiltersPopover.tsx", {
    "@/hooks/useMobileLayout": { useMobileLayout: () => true },
  }).default;
  const app = host(Filters, props);
  const dialog = app.render();
  assert.ok(find(dialog, (node) => node.props?.className?.includes("viewport-modal") && node.props.className.includes("items-center justify-center")));
  assert.ok(find(dialog, (node) => node.props?.className === "sr-only" && node.props.children === "Photo filters"));
  find(dialog, (node) => node.props?.label === "Today").props.onChange();
  assert.equal(draft.datePreset, "today");
  assert.equal(props.applied.datePreset, "anytime", "draft changes must not apply automatically");
  find(dialog, (node) => node.props?.["aria-label"] === "Close filters").props.onClick();
  assert.equal(closes, 1); assert.equal(applies, 0);
  dialog.props.onOpenChange(false);
  assert.equal(closes, 2, "Escape and outside dismissal use the same close handler");
  find(dialog, (node) => node.props?.onCloseAutoFocus).props.onCloseAutoFocus({ preventDefault: noop });
  assert.equal(focused, 1);
  find(dialog, (node) => node.type === "button" && node.props.children === "Apply").props.onClick();
  assert.equal(applies, 1);
  assert.equal(app.render({ open: false }), null);

  const DesktopFilters = compile("../components/library/LibraryFiltersPopover.tsx", {
    "@/hooks/useMobileLayout": { useMobileLayout: () => false },
  }).default;
  const desktop = host(DesktopFilters, props).render();
  assert.equal(desktop.type, "div");
  assert.ok(desktop.props.className.includes("absolute right-0"));
  assert.equal(find(desktop, (node) => node.props?.["aria-label"] === "Close filters"), undefined);
});

test("visual viewport tracks the keyboard, ignores pinch zoom and cleans up listeners", () => {
  let cleanup;
  const values = new Map(), root = { dataset: {}, style: { setProperty: (key, value) => values.set(key, value), removeProperty: (key) => values.delete(key) } };
  const viewport = Object.assign(new EventTarget(), { height: 800, scale: 1, offsetTop: 0 });
  const window = Object.assign(new EventTarget(), { innerHeight: 800, visualViewport: viewport });
  const Component = compile("../components/shared/ViewportHeight.tsx", {
    react: { useEffect: (effect) => { cleanup = effect(); } }, __globals: { document: { documentElement: root }, window },
  }).default;
  Component();
  assert.equal(values.get("--app-height"), "800px");
  viewport.height = 390; viewport.dispatchEvent(new Event("resize"));
  assert.equal(root.dataset.keyboardOpen, "true");
  assert.equal(values.get("--app-height"), "390px");
  viewport.offsetTop = 40; viewport.dispatchEvent(new Event("scroll"));
  assert.equal(values.get("--app-top"), "40px");
  viewport.scale = 2; viewport.height = 200; viewport.dispatchEvent(new Event("resize"));
  assert.equal(values.get("--app-height"), "390px");
  viewport.scale = 1; viewport.height = 800; viewport.dispatchEvent(new Event("resize"));
  assert.equal(root.dataset.keyboardOpen, "false");
  cleanup(); viewport.dispatchEvent(new Event("resize"));
  assert.equal(values.has("--app-height"), false);
  assert.equal(values.has("--app-top"), false);
});

test("responsive mode switches across phones, tablets and desktop without a hydration-dependent server value", () => {
  let width = 1280, cleanup, notifications = 0;
  const listeners = new Set();
  const query = { get matches() { return width < 1024; },
    addEventListener: (_, callback) => listeners.add(callback), removeEventListener: (_, callback) => listeners.delete(callback) };
  const { useMobileLayout: renderLayoutMode } = compile("../hooks/useMobileLayout.ts", {
    react: { useSyncExternalStore(subscribe, get, server) {
      assert.equal(server(), false);
      cleanup ??= subscribe(() => { notifications++; });
      return get();
    } },
    __globals: { window: { matchMedia: () => query } },
  });
  for (const [size, mobile] of [[1280, false], [375, true], [844, true], [1024, false], [320, true]]) {
    width = size; for (const listener of listeners) listener();
    assert.equal(renderLayoutMode(), mobile);
  }
  assert.ok(notifications > 0);
  cleanup(); assert.equal(listeners.size, 0);
});

test("canvas sizing respects phone and desktop padding and guards collapsed viewports", () => {
  const { canvasViewportSize } = load("../hooks/useCanvas.ts");
  const previous = globalThis.getComputedStyle;
  const container = { clientWidth: 375, clientHeight: 250 };
  try {
    globalThis.getComputedStyle = () => ({ paddingLeft: "12px", paddingRight: "12px", paddingTop: "12px", paddingBottom: "12px" });
    assert.deepEqual(canvasViewportSize(container), { width: 351, height: 226 });
    globalThis.getComputedStyle = () => ({ paddingLeft: "32px", paddingRight: "32px", paddingTop: "32px", paddingBottom: "32px" });
    assert.deepEqual(canvasViewportSize(container), { width: 311, height: 186 });
    assert.deepEqual(canvasViewportSize({ clientWidth: 0, clientHeight: 0 }), { width: 1, height: 1 });
  } finally { globalThis.getComputedStyle = previous; }
});

test("two-finger zoom anchors the same image point and clamps zoom without changing document pixels", () => {
  const initial = [1, 0, 0, 1, 20, 30];
  assert.deepEqual(pinchViewport(initial, { x: 120, y: 130 }, { x: 130, y: 140 }, 2), [2, 0, 0, 2, -70, -60]);
  assert.equal(pinchViewport(initial, { x: 120, y: 130 }, { x: 120, y: 130 }, 100)[0], 5);
  assert.equal(pinchViewport(initial, { x: 120, y: 130 }, { x: 120, y: 130 }, 0.001)[0], 0.1);
  assert.deepEqual(initial, [1, 0, 0, 1, 20, 30]);
});

test("real canvas touch handlers pinch, resume one-finger pan, cancel cleanly and leave masks/crop to Fabric", () => {
  const source = readFileSync(new URL("../hooks/useCanvas.ts", import.meta.url), "utf8");
  const snippet = source.slice(source.indexOf("      let isPanning = false;"), source.indexOf('      eventTarget.addEventListener("pointerleave"'));
  assert.ok(snippet.includes("pinchViewport"));
  const code = ts.transpileModule(snippet, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const canvas = { selection: false, isDrawingMode: false, viewportTransform: [1, 0, 0, 1, 0, 0],
    setViewportTransform(value) { this.viewportTransform = value; } };
  const { handlePointerDown: down, handlePointerMove: move, handlePointerUp: up } = vm.runInNewContext(`(() => { ${code}\nreturn {handlePointerDown, handlePointerMove, handlePointerUp}; })()`, {
    canvas, pinchViewport, showBeforeRef: { current: false }, brushPointerRef: { current: null },
    updateBrushCursor: noop, syncViewport: noop,
    wrapper: { getBoundingClientRect: () => ({ left: 0, top: 0 }) },
    eventTarget: { style: {}, setPointerCapture: noop, releasePointerCapture: noop },
  });
  const event = (pointerId, clientX, clientY, type = "pointermove") => ({ pointerId, clientX, clientY, type, pointerType: "touch", button: 0, preventDefault: noop });
  down(event(1, 100, 100)); down(event(2, 200, 100)); move(event(2, 300, 100));
  assert.deepEqual([...canvas.viewportTransform], [2, 0, 0, 2, -100, -100]);
  up(event(2, 300, 100, "pointerup")); move(event(1, 120, 110));
  assert.deepEqual([...canvas.viewportTransform], [2, 0, 0, 2, -80, -90]);
  up(event(1, 120, 110, "pointercancel")); move(event(1, 140, 130));
  assert.deepEqual([...canvas.viewportTransform], [2, 0, 0, 2, -80, -90]);
  for (const property of ["selection", "isDrawingMode"]) {
    canvas[property] = true;
    down(event(1, 100, 100)); down(event(2, 200, 100)); move(event(2, 300, 100));
    assert.deepEqual([...canvas.viewportTransform], [2, 0, 0, 2, -80, -90]);
    canvas[property] = false;
  }
});

test("mobile CSS and client entry points compile without production uploads", async () => {
  const cssRequire = createRequire(import.meta.resolve("@tailwindcss/postcss"));
  const result = await cssRequire("postcss")([cssRequire("@tailwindcss/postcss")({ base: process.cwd() })])
    .process(readFileSync(new URL("../app/globals.css", import.meta.url), "utf8"), { from: "app/globals.css" });
  const value = (selector, property) => {
    let found;
    result.root.walkRules((rule) => {
      if (rule.selector.split(",").some((part) => part.trim() === selector) && rule.parent.params?.includes("1023px")) {
        rule.walkDecls(property, (declaration) => { found = declaration.value; });
      }
    });
    return found;
  };
  assert.equal(value(".editor-toolbar", "height"), "56px");
  assert.equal(value(".editor-toolbar", "grid-template-areas"), '"back controls actions"');
  assert.equal(value(".editor-filename", "display"), "none");
  assert.equal(value(".editor-save-status", "display"), "none");
  assert.equal(value(".editor-export-label", "display"), "none");
  assert.equal(value(".editor-export", "width"), "28px");
  assert.equal(value(".editor-toolbar", "grid-template-columns"), "40px minmax(0, 1fr) 40px");
  assert.equal(value(".editor-toolbar-actions", "justify-content"), "center");
  assert.equal(value(".adjustment-slider-control", "padding-block"), "14px");
  assert.equal(value(".adjustment-slider-control", "margin-block"), "-14px");
  assert.equal(value(".editor-section-panel input", "font-size"), "16px");
  assert.equal(value(".editor-adjustments", "display"), "contents");
  assert.equal(value(".editor-tool-rail", "flex-direction"), "row");
  assert.equal(value('.editor-workspace[data-mobile-panel="adjustments"] .editor-section-panel', "display"), "flex");
  assert.equal(value('.editor-workspace[data-mobile-panel="chat"] .editor-chat-slot', "display"), "flex");
  assert.equal(value(".editor-chat-panel", "width"), "100%");
  assert.equal(value(".editor-section-content", "min-width"), "0");
  assert.equal(value(".editor-tool-buttons button", "width"), "44px");
  assert.equal(value(".editor-tool-rail", "overflow-x"), "auto");
  assert.equal(value(".editor-tool-buttons > *", "flex-shrink"), "0");
  assert.equal(value(".editor-tool-buttons", "gap"), "16px");
  assert.equal(value(".editor-rail-footer", "order"), "-1");
  assert.equal(value(".editor-tool-buttons svg", "width"), "24px");
  assert.equal(value(".editor-rail-footer button > img", "width"), "28px");
  assert.equal(value(".editor-rail-footer button > div", "width"), "28px");
  assert.equal(value('[data-keyboard-open="true"] .editor-workspace[data-mobile-panel="chat"]', "grid-template-rows"), "0 minmax(0, 1fr) 0");
  const { build } = createRequire(import.meta.resolve("tsx"))("esbuild");
  const compiled = await build({ entryPoints: ["components/editor/EditorApp.tsx", "app/(dashboard)/library/LibraryPageClient.tsx"],
    bundle: true, packages: "external", platform: "browser", format: "esm", splitting: true, outdir: "/tmp/redux-mobile-compile",
    write: false, metafile: true, loader: { ".png": "dataurl", ".jpg": "dataurl" }, logLevel: "silent" });
  assert.ok(Object.keys(compiled.metafile.inputs).length > 100);
});
