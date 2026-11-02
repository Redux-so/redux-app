import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import { require as tsxRequire } from "tsx/cjs/api";

const nativeRequire = createRequire(import.meta.url);
const load = (path) => tsxRequire(path, import.meta.url);
const { editorPlanSchema, actionCost, planCost } = load("../lib/editor-actions.ts");
const { runEditorPlan } = load("../lib/editor-action-runner.ts");
const { useEditorChatTools: createEditorChatTools } = load("../hooks/useEditorChatTools.ts");
const { defaultPersistedEditorState } = load("../lib/editor-state.ts");
function compile(path, adapters) {
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(code, { module: mod, exports: mod.exports, Request, Response, URL, Buffer, TextEncoder, process: { env: {} },
    console: { error() {} }, require: (id) => adapters[id] ?? (id.startsWith("@/") ? load(`../${id.slice(2)}`) : nativeRequire(id)) });
  return mod.exports;
}
const turnId = "b501765b-7815-4a8a-986d-43ab939294b9";
const imageUrl = "https://res.cloudinary.com/demo/image/upload/v1/photo.png";
const execution = () => ({ signal: new AbortController().signal, isCurrent: () => true, progress() {} });

test("plans validate all panel action families, crop bounds, slider ranges and history isolation", () => {
  for (const action of [
    { type: "adjust", values: { exposure: 2, clarity: 3, temperature: -10 } },
    { type: "rotate", degrees: -90 }, { type: "flip", axis: "vertical" }, { type: "straighten", degrees: 2.5 },
    { type: "crop", region: { x: 0.2, y: 0, width: 0.8, height: 1 } }, { type: "crop_aspect", width: 4, height: 5 },
    { type: "resize", width: 900, height: 700 }, { type: "brush", tool: "heal", size: 25 },
    { type: "apply_selection", tool: "blur", intensity: 70 },
    ...["auto_enhance", "auto_tone_balance", "smart_color_balance", "style_match", "remove_background", "undo", "redo"].map((type) => ({ type })),
    { type: "generative_fill", direction: "right", pixels: 128, prompt: "Extend the landscape" },
    { type: "revert", versionId: "original" },
  ]) assert.equal(editorPlanSchema.safeParse({ actions: [action] }).success, true, JSON.stringify(action));
  for (const actions of [
    [{ type: "rotate", degrees: 77 }], [{ type: "adjust", values: { exposure: 101 } }],
    [{ type: "adjust", values: { invented: 3 } }], [{ type: "adjust", values: {} }],
    [{ type: "crop", region: { x: 0.8, y: 0, width: 0.5, height: 1 } }],
    [{ type: "brush", tool: "blur", size: 0 }], [{ type: "undo" }, { type: "remove_background" }],
    Array.from({ length: 9 }, () => ({ type: "remove_background" })),
  ]) assert.equal(editorPlanSchema.safeParse({ actions }).success, false, JSON.stringify(actions));
});

test("costs are shared with panel billing; blur and brush preparation are free", () => {
  assert.equal(actionCost({ type: "apply_selection", tool: "blur" }), 0);
  assert.equal(actionCost({ type: "brush", tool: "heal", size: 20 }), 0);
  assert.equal(planCost({ actions: [{ type: "remove_background" }, { type: "generative_fill" }, { type: "apply_selection", tool: "heal" }] }), 6);
});

test("ordered execution consumes each preceding result and stops after failure or input requests", async () => {
  let revision = 0;
  const calls = [];
  const plan = { actions: [{ type: "rotate", degrees: 90 }, { type: "adjust", values: { exposure: 10 } }, { type: "remove_background" }] };
  const outcomes = await runEditorPlan(plan, execution(), {
    getRevision: () => revision,
    execute: async (action, index, guard) => { assert.equal(guard(), true); calls.push(index); revision++; if (action.type === "remove_background") throw new Error("Insufficient credits"); return `${action.type} done`; },
  });
  assert.deepEqual(calls, [0, 1, 2]);
  assert.deepEqual(outcomes.map((o) => o.status), ["applied", "applied", "failed"]);
  const pending = await runEditorPlan({ actions: [{ type: "brush", tool: "blur", size: 30 }, { type: "rotate", degrees: 90 }] }, execution(), {
    getRevision: () => 0, execute: async () => ({ needsInput: "Paint first" }),
  });
  assert.equal(pending.length, 1);
  assert.equal(pending[0].status, "needs_input");
});

test("manual changes or cancellation during a tool prevent stale results and remaining edits", async () => {
  let revision = 0, commits = 0;
  const controller = new AbortController();
  for (const cancel of [false, true]) {
    const outcomes = await runEditorPlan({ actions: [{ type: "remove_background" }, { type: "rotate", degrees: 90 }] },
      { ...execution(), signal: controller.signal }, {
        getRevision: () => revision,
        execute: async (_, __, guard) => { if (cancel) controller.abort(); else revision++; await Promise.resolve(); if (!guard()) throw new Error("Stale image"); commits++; return "done"; },
      });
    assert.equal(outcomes.length, 1);
    assert.equal(outcomes[0].status, "failed");
  }
  assert.equal(commits, 0);
});

function serverHost(options = {}) {
  const plan = options.plan ?? { actions: [{ type: "remove_background" }] };
  const run = { turnId, plan, status: options.status ?? "pending", turn: { imageId: "photo-a", attachmentUrl: null } };
  const steps = new Map();
  const state = { calls: 0, charges: 0, refunds: 0, assistantText: "", lastAction: null };
  const prisma = {
    chatToolRun: {
      findFirst: async ({ where }) => where.turn.image.userId === "user-a" && !options.deleted ? structuredClone(run) : null,
      updateMany: async ({ where, data }) => { if (run.status !== where.status) return { count: 0 }; Object.assign(run, data); return { count: 1 }; },
      update: async ({ data }) => Object.assign(run, data),
    },
    chatTurn: { update: async ({ data }) => { state.assistantText = data.assistantText; return data; } },
    chatToolStep: {
      findUnique: async ({ where }) => steps.get(where.id) ?? null,
      create: async ({ data }) => { if (steps.has(data.id)) throw new Error("unique"); steps.set(data.id, { ...data, status: "running" }); return data; },
      update: async ({ where, data }) => Object.assign(steps.get(where.id), data),
    },
    $transaction: async (calls) => Promise.all(calls),
  };
  const route = compile("../app/api/ai/chat/tools/route.ts", {
    "@/lib/prisma": { prisma },
    "@/lib/require-user": { requireAuthUser: async () => options.anonymous ? { error: new Response(null, { status: 401 }) } : { user: { id: options.otherUser ? "user-b" : "user-a", creditBalance: options.balance ?? 20 } } },
    "@/lib/verify-user-image": { assertUserOwnsImageUrl: async (_, url) => url === imageUrl ? { id: options.otherImage ? "photo-b" : "photo-a" } : null },
    "@/lib/chat-tool-dispatch": { dispatchChatTool: async (_, action) => {
      state.calls++; state.charges += actionCost(action); state.lastAction = action;
      if (options.wait) await options.wait;
      if (options.providerFails) { state.refunds += actionCost(action); return Response.json({ error: "Provider failed" }, { status: 502 }); }
      return Response.json({ resultUrl: `${imageUrl}?result=1` });
    } },
  }).POST;
  return { run, steps, state, send: (data) => route(new Request("http://localhost/api/ai/chat/tools", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ turnId, ...data }),
  })) };
}

test("paid execution requires approval, ownership, sufficient credits and the server's immutable plan", async () => {
  const app = serverHost();
  assert.equal((await app.send({ phase: "execute", index: 0, imageUrl })).status, 409);
  assert.equal(app.state.charges, 0);
  assert.equal((await app.send({ phase: "approve" })).status, 200);
  assert.equal(app.state.charges, 0);
  assert.equal((await app.send({ phase: "execute", index: 0, imageUrl, action: { type: "generative_fill" } })).status, 400);
  assert.equal((await app.send({ phase: "execute", index: 0, imageUrl })).status, 200);
  assert.equal(app.state.lastAction.type, "remove_background");
  assert.equal(app.state.charges, 1);
  const insufficient = serverHost({ balance: 0 });
  assert.equal((await insufficient.send({ phase: "approve" })).status, 402);
  assert.equal(insufficient.state.charges, 0);
  for (const options of [{ anonymous: true }, { otherUser: true }, { deleted: true }, { otherImage: true, status: "running" }]) {
    const denied = serverHost(options);
    const response = await denied.send({ phase: "execute", index: 0, imageUrl });
    assert.ok([401, 404].includes(response.status)); assert.equal(denied.state.charges, 0);
  }
});

test("duplicates and concurrent requests execute and charge a paid tool exactly once", async () => {
  let release;
  const wait = new Promise((resolve) => { release = resolve; });
  const app = serverHost({ status: "running", wait });
  const first = app.send({ phase: "execute", index: 0, imageUrl });
  // Wait until the provider adapter is entered, not a fixed timeout.
  while (!app.state.calls) await new Promise((resolve) => setImmediate(resolve));
  assert.equal((await app.send({ phase: "execute", index: 0, imageUrl })).status, 409);
  release(); assert.equal((await first).status, 200);
  const replay = await app.send({ phase: "execute", index: 0, imageUrl });
  assert.equal(replay.status, 200);
  assert.match((await replay.json()).resultUrl, /result=1/);
  assert.equal(app.state.calls, 1); assert.equal(app.state.charges, 1);
});

test("provider failures retain the endpoint's refund and cannot be retried or followed by another paid step", async () => {
  const app = serverHost({ status: "running", providerFails: true, plan: { actions: [{ type: "remove_background" }, { type: "auto_enhance" }] } });
  assert.equal((await app.send({ phase: "execute", index: 1, imageUrl })).status, 409);
  assert.equal((await app.send({ phase: "execute", index: 0, imageUrl })).status, 502);
  assert.equal((await app.send({ phase: "execute", index: 0, imageUrl })).status, 409);
  assert.equal((await app.send({ phase: "execute", index: 1, imageUrl })).status, 409);
  assert.equal(app.state.calls, 1); assert.equal(app.state.charges, 1); assert.equal(app.state.refunds, 1);
});

test("cancelled plans cannot execute; final reports persist without replaying tools", async () => {
  const app = serverHost();
  assert.equal((await app.send({ phase: "cancel" })).status, 200);
  assert.equal((await app.send({ phase: "approve" })).status, 409);
  assert.equal(app.state.charges, 0);
  const complete = serverHost({ status: "running" });
  assert.equal((await complete.send({ phase: "finish", message: "Rotate completed. Background removal failed." })).status, 200);
  assert.equal(complete.state.assistantText, "Rotate completed. Background removal failed.");
  assert.equal((await complete.send({ phase: "execute", index: 0, imageUrl })).status, 409);
});

function editorHost(extra = {}) {
  const state = defaultPersistedEditorState();
  state.workingImageUrl = imageUrl; state.workingWidth = 1200; state.workingHeight = 800;
  const calls = [], bodies = [];
  let revision = 0;
  const change = (name) => { revision++; calls.push(name); };
  const tools = createEditorChatTools({ imageId: "photo-a", originalUrl: imageUrl, width: 1200, height: 800, ready: true, isCropping: false,
    getState: () => state, getRevision: () => revision, getSelections: () => [], clearSelections() {}, versions: [], brushSizes: { heal: 20, eraser: 20, blur: 20 },
    controls: { current: { openBrush: (tool, size) => calls.push(`brush:${tool}:${size}`), closeBrush() {} } },
    patch: (values) => { Object.assign(state.sliders, values); change("adjust"); return true; },
    rotateCW: () => { state.transform.rotation += 90; change("rotate"); }, rotateCCW: () => change("rotate-left"),
    flipH: () => change("flip"), flipV: () => change("flip"), straighten: () => change("straighten"),
    resize: async (w, h, guard, region) => { assert.equal(guard(), true); calls.push(`crop:${w}:${h}:${!!region}`); return "data:image/png;base64,YQ=="; },
    commitPixels: (_, guard) => { assert.equal(guard(), true); change("commit-crop"); },
    exportMasks: { blur: async () => "bWFzaw==", heal: async () => "bWFzaw==", eraser: async () => "bWFzaw==" },
    reload: async (url, guard, _label, _resetTransform, adjustments) => { assert.equal(guard(), true); state.workingImageUrl = url;
      if (adjustments) state.sliders = { ...defaultPersistedEditorState().sliders, ...adjustments };
      change("reload"); return true; },
    undo: () => change("undo"), redo: () => change("redo"), canUndo: true, canRedo: true, revert: async () => change("revert"), save: async () => { calls.push("save"); return state; },
    restore: async (snapshot) => { Object.assign(state, snapshot, { sliders: { ...snapshot.sliders }, transform: { ...snapshot.transform } }); change("restore"); },
    ...extra,
  });
  return { tools, state, calls, bodies,
    manualChange: (values) => { Object.assign(state.sliders, values); change("manual"); },
    fetch: async (_, init) => {
    const body = JSON.parse(init.body); bodies.push(body);
    if (body.phase === "execute") return Response.json({ resultUrl: `${imageUrl}?new=${body.index}` });
    return Response.json({ ok: true });
  } };
}

test("editor bridge applies geometry and effects in sequence, saves, and reports actual outcomes", async () => {
  const app = editorHost();
  const original = globalThis.fetch; globalThis.fetch = app.fetch;
  try {
    const result = await app.tools.execute({ turnId, credits: 1, actions: [{ type: "rotate", degrees: 90 }, { type: "remove_background" }, { type: "adjust", values: { grain: 8 } }] }, execution());
    assert.deepEqual(app.calls, ["rotate", "reload", "adjust", "save"]);
    assert.equal(app.state.sliders.grain, 8);
    assert.match(result, /Removed the background/);
    assert.doesNotMatch(result, /completed|grain \+8/);
    assert.equal(app.bodies.at(-1).phase, "finish");
    assert.equal(app.bodies.at(-1).message, result);
  } finally { globalThis.fetch = original; }
});

/** Exercise the actual review handlers without mounting unrelated chat UI. */
function reviewUi() {
  const file = ts.createSourceFile("ChatPanel.tsx", readFileSync(new URL("../components/editor/ChatPanel.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const functions = [], executions = [];
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && ["reviewToolChanges", "handleUndoAllChanges", "handleKeepAllChanges"].includes(node.name?.text)) functions.push(node.getText(file));
    if (ts.isCallExpression(node) && node.expression.getText(file).includes("toolExecutorRef.current!")) executions.push(node);
    ts.forEachChild(node, visit);
  }
  visit(file);
  assert.equal(executions.length, 2, "free edits and approved paid edits both execute tools");
  for (const call of executions) assert.ok(call.arguments[1].properties.some((p) => p.name?.getText(file) === "reviewChanges"), "both execution paths must connect the review panel");
  const context = { sending: false, changes: [], errors: [],
    canUndoChatRef: { current: null }, undoToolReviewRef: { current: null }, changeSnapshotRef: { current: null },
    onUndo() { assert.fail("multi-step review must restore its complete snapshot"); },
  };
  Object.assign(context, {
    setPendingChanges(value) { context.changes = value; }, setChangesExpanded(value) { context.expanded = value; },
    setReviewIncludesPaidTools(value) { context.includesPaidTools = value; }, setSending(value) { context.sending = value; },
    toast: { error: (message) => context.errors.push(message) },
  });
  const compiled = ts.transpileModule(functions.join("\n"), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const handlers = vm.runInNewContext(`${compiled}\n({reviewToolChanges, handleUndoAllChanges, handleKeepAllChanges});`, context);
  return { ...handlers, state: context };
}

test("chat slider edits restore the Changes panel with exact values and a readable saved reply", async () => {
  const app = editorHost(), ui = reviewUi();
  const original = globalThis.fetch; globalThis.fetch = app.fetch;
  try {
    const message = await app.tools.execute({ turnId, credits: 0, actions: [{ type: "adjust", values: { exposure: 15, shadows: 20 } }] },
      { ...execution(), reviewChanges: ui.reviewToolChanges });
    assert.deepEqual(ui.state.changes.map(({ key, from, to }) => ({ key, from, to })), [
      { key: "exposure", from: 0, to: 15 }, { key: "shadows", from: 0, to: 20 },
    ]);
    assert.match(message, /Brightened the image and lifted the shadows/);
    assert.doesNotMatch(message, /15|20|completed/);
    assert.equal(app.bodies.at(-1).message, message);
    await ui.handleUndoAllChanges();
    assert.equal(app.state.sliders.exposure, 0);
    assert.equal(app.state.sliders.shadows, 0);
    assert.equal(ui.state.changes.length, 0);
    assert.deepEqual(app.calls, ["adjust", "save", "restore", "save"]);
  } finally { globalThis.fetch = original; }
});

test("multi-action reviews include pixels, geometry and slider changes; Undo all restores the whole request", async () => {
  const app = editorHost(), ui = reviewUi();
  const original = globalThis.fetch; globalThis.fetch = app.fetch;
  try {
    const message = await app.tools.execute({ turnId, credits: 1, actions: [{ type: "rotate", degrees: 90 }, { type: "remove_background" }, { type: "adjust", values: { grain: 8 } }] },
      { ...execution(), reviewChanges: ui.reviewToolChanges });
    assert.ok(ui.state.changes.some((change) => change.label === "Rotation" && change.from === "0°" && change.to === "90°"));
    assert.ok(ui.state.changes.some((change) => change.label === "Remove background"));
    assert.ok(ui.state.changes.some((change) => change.key === "grain" && change.to === 8));
    assert.equal(ui.state.includesPaidTools, true);
    assert.match(message, /\*\*Edits applied\*\*/);
    await ui.handleUndoAllChanges();
    assert.equal(app.state.workingImageUrl, imageUrl);
    assert.equal(app.state.transform.rotation, 0);
    assert.equal(app.state.sliders.grain, 0);
    assert.equal(app.bodies.filter((body) => body.phase === "execute").length, 1, "undo must never rerun or refund a paid tool");
    assert.equal(app.calls.filter((call) => call === "restore").length, 1);
  } finally { globalThis.fetch = original; }
});

test("Keep all dismisses review without reverting, and stale Undo all cannot overwrite later edits", async () => {
  const app = editorHost(), ui = reviewUi();
  const original = globalThis.fetch; globalThis.fetch = app.fetch;
  try {
    const plan = { turnId, credits: 0, actions: [{ type: "adjust", values: { exposure: 15 } }] };
    await app.tools.execute(plan, { ...execution(), reviewChanges: ui.reviewToolChanges });
    ui.handleKeepAllChanges();
    assert.equal(ui.state.changes.length, 0);
    assert.equal(app.state.sliders.exposure, 15);
    await app.tools.execute({ ...plan, actions: [{ type: "adjust", values: { exposure: 25 } }] }, { ...execution(), reviewChanges: ui.reviewToolChanges });
    app.manualChange({ exposure: 30 });
    await ui.handleUndoAllChanges();
    assert.equal(app.state.sliders.exposure, 30);
    assert.equal(app.calls.includes("restore"), false);
    assert.match(ui.state.errors[0], /Use History/);
    assert.equal(ui.state.changes.length, 1);
  } finally { globalThis.fetch = original; }
});

test("partial failure reviews only applied edits and never attributes intervening manual changes to the agent", async () => {
  const app = editorHost(), ui = reviewUi();
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (JSON.parse(init.body).phase === "execute") {
      app.manualChange({ exposure: 88 });
      return Response.json({ error: "Provider unavailable" }, { status: 503 });
    }
    return app.fetch(url, init);
  };
  try {
    const message = await app.tools.execute({ turnId, credits: 1, actions: [
      { type: "adjust", values: { exposure: 15 } }, { type: "remove_background" }, { type: "flip", axis: "horizontal" },
    ] }, { ...execution(), reviewChanges: ui.reviewToolChanges });
    assert.deepEqual(ui.state.changes.map(({ key, to }) => ({ key, to })), [{ key: "exposure", to: 15 }]);
    assert.match(message, /Provider unavailable/);
    assert.doesNotMatch(message, /Removed the background|Flipped the image/);
    assert.equal(ui.state.canUndoChatRef.current(), false);
  } finally { globalThis.fetch = original; }
});

test("unchanged settings do not invent change rows", async () => {
  const app = editorHost(), ui = reviewUi();
  const original = globalThis.fetch; globalThis.fetch = app.fetch;
  try {
    const message = await app.tools.execute({ turnId, credits: 0, actions: [{ type: "adjust", values: { exposure: 0 } }] },
      { ...execution(), reviewChanges: ui.reviewToolChanges });
    assert.equal(ui.state.changes.length, 0);
    assert.equal(message, "The requested settings already match your image.");
  } finally { globalThis.fetch = original; }
});

test("save failures keep the exact change review available and remain explicit in the reply", async () => {
  const app = editorHost({ save: async () => { throw new Error("Storage unavailable"); } }), ui = reviewUi();
  const original = globalThis.fetch; globalThis.fetch = app.fetch;
  try {
    const message = await app.tools.execute({ turnId, credits: 0, actions: [{ type: "adjust", values: { exposure: 15 } }] },
      { ...execution(), reviewChanges: ui.reviewToolChanges });
    assert.equal(ui.state.changes[0].to, 15);
    assert.match(message, /saving failed.*Storage unavailable/);
    assert.equal(app.bodies.at(-1).message, message);
  } finally { globalThis.fetch = original; }
});

test("missing selections open the brush without approval, billing or provider calls", async () => {
  const app = editorHost();
  const original = globalThis.fetch; globalThis.fetch = app.fetch;
  try {
    const result = await app.tools.execute({ turnId, credits: 2, actions: [{ type: "apply_selection", tool: "heal" }] }, execution());
    assert.match(result, /Paint over/);
    assert.equal(app.calls[0], "brush:heal:undefined");
    assert.deepEqual(app.bodies.map((b) => b.phase), ["finish"]);
  } finally { globalThis.fetch = original; }
});

test("painted masks use source pixels and failed or stale requests never overwrite the canvas", async () => {
  for (const stale of [false, true]) {
    const app = editorHost({ getSelections: () => ["heal"] });
    const original = globalThis.fetch; globalThis.fetch = async (url, init) => {
      const body = JSON.parse(init.body);
      if (body.phase === "execute") { assert.equal(body.maskBase64, "bWFzaw=="); assert.equal(body.imageUrl, imageUrl); return Response.json({ error: "Insufficient credits" }, { status: 402 }); }
      return app.fetch(url, init);
    };
    try {
      if (stale) await assert.rejects(() => app.tools.execute({ turnId, actions: [{ type: "apply_selection", tool: "heal" }] }, { ...execution(), isUnchanged: () => false }), /image changed/);
      else assert.match(await app.tools.execute({ turnId, actions: [{ type: "apply_selection", tool: "heal" }] }, execution()), /Insufficient credits/);
      assert.equal(app.calls.includes("reload"), false);
    } finally { globalThis.fetch = original; }
  }
});

test("the dispatcher uses the actual paid panel endpoint and preserves its charge/refund behavior", async () => {
  for (const fails of [false, true]) {
    let charges = 0, refunds = 0, providerCalls = 0;
    const background = compile("../app/api/ai/background-remove/route.ts", {
      replicate: { default: class { async run() { providerCalls++; if (fails) throw new Error("provider unavailable"); return "https://replicate.delivery/result.png"; } } },
      "@/lib/prisma": { prisma: { image: { findFirst: async () => ({ id: "photo-a", filename: "photo.jpg" }) }, imageVersion: { create: async () => ({}) } } },
      "@/lib/require-user": { requireAuthUser: async () => ({ user: { id: "user-a", creditBalance: 10 } }) },
      "@/lib/kv": { checkRateLimit: async () => null, checkRateLimitPerMinute: async () => null, RATE_LIMIT_MINUTE: {} },
      "@/lib/expensive-route-guard": { rateLimitDeniedResponse: () => null },
      "@/lib/atomic-credits": {
        chargeCreditFeature: async ({ feature }) => { assert.equal(feature, "remove_background"); charges++; return { ok: true }; },
        refundCreditFeature: async ({ feature }) => { assert.equal(feature, "remove_background"); refunds++; },
      },
      "@/lib/safe-remote-fetch": {
        fetchReplicateDeliveryBuffer: async () => ({ buffer: Buffer.from("image") }),
        fetchTrustedMediaBuffer: async () => ({ buffer: Buffer.from("source") }),
      },
      "@/lib/retouch-image": { applyBackgroundMatte: async (_source, output) => output },
      "@/lib/cloudinary": { uploadToCloudinary: async () => ({ secureUrl: imageUrl, publicId: "result" }) },
      "@/lib/api-error": { apiInternalErrorResponse: () => Response.json({ error: "Background removal failed" }, { status: 500 }) },
    });
    const adapters = Object.fromEntries([
      "ai/enhance", "ai/tone", "ai/color-balance", "ai/style-match", "ai/generative-fill", "images/blur", "images/erase", "ai/heal",
    ].map((path) => [`@/app/api/${path}/route`, { POST: async () => { throw new Error("Wrong tool selected"); } }]));
    adapters["@/app/api/ai/background-remove/route"] = background;
    const { dispatchChatTool } = compile("../lib/chat-tool-dispatch.ts", adapters);
    const response = await dispatchChatTool(new Request("http://localhost/api/ai/chat/tools"), { type: "remove_background" }, { imageId: "photo-a", imageUrl }, null);
    assert.equal(response.status, fails ? 500 : 200);
    assert.equal(providerCalls, 1); assert.equal(charges, 1); assert.equal(refunds, fails ? 1 : 0);
  }
});

test("aspect crops use current transformed dimensions; ordinary geometry and history share editor callbacks", async () => {
  const app = editorHost();
  const original = globalThis.fetch; globalThis.fetch = app.fetch;
  try {
    await app.tools.execute({ turnId, actions: [{ type: "rotate", degrees: 90 }, { type: "crop_aspect", width: 1, height: 1 }, { type: "flip", axis: "horizontal" }, { type: "straighten", degrees: 2 }] }, execution());
    assert.deepEqual(app.calls, ["rotate", "crop:800:800:false", "commit-crop", "flip", "straighten", "save"]);
  } finally { globalThis.fetch = original; }
});

test("chat Style Match reloads baked pixels with neutral sliders and Undo all restores the previous grade", async () => {
  const app = editorHost(), ui = reviewUi();
  app.manualChange({ grain: 70, exposure: 25, hue: 40 });
  app.state.transform.rotation = 90;
  const before = structuredClone(app.state);
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (JSON.parse(init.body).phase === "execute") return Response.json({ resultUrl: `${imageUrl}?matched`, adjustments: defaultPersistedEditorState().sliders });
    return app.fetch(url, init);
  };
  try {
    await app.tools.execute({ turnId, credits: 3, actions: [{ type: "style_match" }] }, { ...execution(), reviewChanges: ui.reviewToolChanges });
    assert.equal(app.state.workingImageUrl, `${imageUrl}?matched`);
    assert.deepEqual(app.state.sliders, defaultPersistedEditorState().sliders);
    assert.equal(app.state.transform.rotation, 90);
    assert.equal(app.calls.filter(call => call === "reload").length, 1);
    assert.equal(app.calls.filter(call => call === "adjust").length, 0);
    await ui.handleUndoAllChanges();
    assert.deepEqual(app.state, before);
  } finally { globalThis.fetch = original; }
});
