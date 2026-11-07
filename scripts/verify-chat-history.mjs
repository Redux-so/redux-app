/** Real chat persistence/stream routes with isolated auth, database and model adapters. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import { require as tsxRequire } from "tsx/cjs/api";

const nativeRequire = createRequire(import.meta.url);
const load = (path) => tsxRequire(path, import.meta.url);
const { messagesFromTurns, cleanChatText } = load("../lib/chat-history-shared.ts");
function compile(path, adapters) {
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const routeModule = { exports: {} };
  vm.runInNewContext(code, { module: routeModule, exports: routeModule.exports,
    Request, Response, URL, Buffer, TextEncoder, ReadableStream, AbortController,
    Date: adapters.__clock ?? Date,
    ...adapters.__globals,
    console: { ...console, error() {} },
    require: (id) => adapters[id] ?? (id.startsWith("@/") ? load(`../${id.slice(2)}`) : nativeRequire(id)),
  });
  return routeModule.exports;
}
const turnId = "b501765b-7815-4a8a-986d-43ab939294b9";
function host(options = {}) {
  const rows = options.rows ?? [];
  const state = { modelCalls: 0, charges: 0, updates: 0, uploads: 0, rateChecks: 0, modelMessages: [], toolPlans: [], modelTools: [], modelConfigs: [] };
  const matches = (row, where) => row.imageId === where.imageId && where.image.userId === "user-a" &&
    row.imageId === "photo-a" && (!where.status || row.status === where.status) &&
    (!where.sequence || row.sequence < where.sequence.lt);
  const prisma = {
    chatToolRun: { create: async ({ data }) => { state.toolPlans.push(data); return data; } },
    image: { findFirst: async ({ where }) => where.id === "photo-a" && where.userId === "user-a" ? { id: where.id } : null },
    user: { update: async () => { state.charges++; } },
    chatTurn: {
      findUnique: async ({ where }) => rows.find((row) => row.id === where.id) ?? null,
      findMany: async ({ where, take, select }) => rows.filter((row) => matches(row, where)).sort((a, b) => b.sequence - a.sequence).slice(0, take)
        .map((row) => Object.fromEntries(Object.keys(select).map((key) => [key, row[key]]))),
      create: async ({ data }) => {
        if (options.failCreate) throw new Error("database offline");
        if (rows.some((row) => row.id === data.id)) throw new Error("unique constraint");
        const row = { sequence: rows.length + 1, assistantText: "", status: "streaming", attachmentUrl: null, createdAt: new Date(), ...data };
        rows.push(row); return row;
      },
      update: async ({ where, data }) => {
        state.updates++;
        if (options.failUpdate) throw new Error("database offline");
        Object.assign(rows.find((row) => row.id === where.id), data);
      },
    },
  };
  const auth = { requireAuthUser: async () => options.anonymous ? { error: new Response(null, { status: 401 }) }
    : { user: { id: "user-a", lifetimeFreeAI: options.lifetimeFreeAI ?? (options.paid ? 20 : 0), creditBalance: options.creditBalance ?? 10 } } };
  const history = compile("../lib/chat-history.ts", { "@/lib/prisma": { prisma } });
  const adapters = {
    __clock: options.clock,
    "@/lib/prisma": { prisma }, "@/lib/require-user": auth, "@/lib/chat-history": history,
    "@/lib/anthropic": {
      formatAdjustmentsForPrompt: () => "Current adjustments", anthropic: { messages: { stream({ messages, tools, tool_choice, system }) {
        const attempt = options.modelAttempts?.[state.modelCalls] ?? options;
        state.modelConfigs.push({ tool_choice, system });
        state.modelCalls++; state.modelMessages = messages; state.modelTools = tools ?? [];
        let aborted = false;
        return {
          abort() { aborted = true; },
          async *[Symbol.asyncIterator]() {
            for (const event of attempt.modelEvents ?? []) yield event;
            for (const text of attempt.chunks ?? ['Done. ', '[adjustments]{"exposure":12}[/adjustments]']) {
              if (aborted) throw new Error("aborted");
              yield { type: "content_block_delta", delta: { type: "text_delta", text } };
              options.afterChunk?.();
            }
            if (attempt.failStream || aborted) throw new Error("model interrupted");
          },
        };
      } } },
    },
    "@/lib/kv": {
      checkRateLimit: async () => { state.rateChecks++; return { allowed: !options.blockChatRequests, remaining: 0 }; },
      checkRateLimitPerMinute: async () => { state.rateChecks++; return { allowed: !options.blockChatRequests, remaining: 0 }; },
      RATE_LIMIT_MINUTE: {},
    },
    "@/lib/expensive-route-guard": { rateLimitDeniedResponse: (result) => result.allowed ? null : new Response(null, { status: 429 }) },
    "@/lib/atomic-credits": { chargeCreditFeature: async (_params, persist) => { await persist?.(prisma); state.charges++; return { ok: true, balanceAfter: 9 }; },
      insufficientCreditsResponse: () => new Response(null, { status: 402 }) },
    "@/lib/cloudinary": { uploadToCloudinary: async () => { state.uploads++; return { secureUrl: "https://example.com/reference.png", publicId: "reference-id" }; }, deleteFromCloudinary: async () => {} },
    "@/lib/chat-image-vision-server": { prepareChatVisionBase64: async () => ({ base64: "aW1hZ2U=", mediaType: "image/png" }) },
  };
  const post = compile("../app/api/ai/chat/route.ts", adapters).POST;
  const get = compile("../app/api/images/[imageId]/chat/route.ts", adapters).GET;
  return { rows, state, history,
    send: (body = {}, signal) => post(new Request("http://localhost/api/ai/chat", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageId: "photo-a", userMessage: "Make it brighter", turnId, ...body }), signal })),
    get: (imageId = "photo-a", before = "") => get(new Request(`http://localhost/api/images/${imageId}/chat${before ? `?before=${before}` : ""}`), { params: Promise.resolve({ imageId }) }),
  };
}
function events(text) { return text.trim().split("\n\n").filter(Boolean).map((line) => JSON.parse(line.slice(6))); }

test("chat access depends on free allowance and credits even when old rate counters are exhausted", async () => {
  for (const [lifetimeFreeAI, creditBalance, expectedStatus] of [
    [0, 0, 200], [19, 0, 200], [0, 150, 200], [20, 1, 200], [20, 0, 402], [25, 0, 402],
  ]) {
    const app = host({ lifetimeFreeAI, creditBalance, blockChatRequests: true, chunks: ["The exposure looks balanced."] });
    const response = await app.send({ chatInteractionMode: "ask" });
    assert.equal(response.status, expectedStatus);
    await response.text();
    assert.equal(app.state.rateChecks, 0);
    assert.equal(app.state.modelCalls, expectedStatus === 200 ? 1 : 0);
    if (expectedStatus === 402) assert.equal(app.state.charges, 0);
  }
});

test("completed exchanges restore exact text and references without replaying edits or billing", async () => {
  const app = host();
  const response = await app.send({ imageBase64: "aW1hZ2U=", imageMediaType: "image/png" });
  assert.equal(response.status, 200);
  const emitted = events(await response.text());
  assert.ok(emitted.some((event) => event.type === "adjustments"));
  assert.equal(app.rows[0].assistantText, "Done.");
  assert.equal(app.rows[0].status, "complete");
  assert.equal(app.rows[0].attachmentUrl, "https://example.com/reference.png");
  assert.equal(app.state.updates, 1, "fast streams should write once, not once per token");
  const saved = await app.get();
  assert.match(saved.headers.get("Cache-Control"), /no-store/);
  const page = await saved.json();
  const transcript = messagesFromTurns(page.turns);
  assert.equal(transcript.length, 2);
  assert.equal(transcript[0].imagePreview, "https://example.com/reference.png");
  assert.equal(transcript[1].content, "Done.");
  assert.equal(transcript[1].interrupted, false);
  assert.equal(page.turns[0].attachmentPublicId, undefined);
  assert.equal(app.state.modelCalls, 1);
  assert.equal(app.state.charges, 1);
});

test("history is paginated in stable chronological order and bounded separately from model context", async () => {
  const rows = Array.from({ length: 43 }, (_, index) => ({ id: `turn-${index}`, sequence: index + 1, imageId: "photo-a",
    userText: `Message ${index}`, assistantText: `Response ${index}`, status: "complete", attachmentUrl: null, createdAt: new Date() }));
  rows.push({ ...rows[0], id: "foreign", imageId: "photo-b", sequence: 44 });
  const app = host({ rows });
  const latest = await (await app.get()).json();
  assert.equal(latest.turns.length, 20);
  assert.equal(latest.turns[0].sequence, 24);
  assert.equal(latest.beforeCursor, 24);
  const older = await (await app.get("photo-a", "24")).json();
  const oldest = await (await app.get("photo-a", String(older.beforeCursor))).json();
  assert.equal(oldest.beforeCursor, null);
  assert.deepEqual([...oldest.turns, ...older.turns, ...latest.turns].map((row) => row.sequence), Array.from({ length: 43 }, (_, i) => i + 1));
  await (await app.send({ conversationHistory: [{ role: "user", content: "UNTRUSTED CLIENT HISTORY" }] })).text();
  const modelMessages = app.state.modelMessages;
  assert.equal(modelMessages.length, 21);
  assert.equal(modelMessages[0].content, "Message 33");
  assert.equal(JSON.stringify(modelMessages).includes("UNTRUSTED"), false);
});

test("image ownership, authentication, cursor validation and duplicate turn IDs prevent unauthorized work", async () => {
  const app = host();
  assert.equal((await app.get("photo-b")).status, 404);
  assert.equal((await app.send({ imageId: "photo-b" })).status, 404);
  for (const cursor of ["-1", "0", "abc", "2147483648"]) assert.equal((await app.get("photo-a", cursor)).status, 400);
  assert.equal(app.state.charges, 0);
  const anonymous = host({ anonymous: true });
  assert.equal((await anonymous.get()).status, 401);
  assert.equal((await anonymous.send()).status, 401);
  await (await app.send()).text();
  assert.equal((await app.send()).status, 409);
  assert.equal(app.state.charges, 1);
  assert.equal(app.rows.length, 1);
});

test("a failed initial save does not call or charge the model", async () => {
  const app = host({ failCreate: true });
  assert.equal((await app.send()).status, 503);
  assert.equal(app.state.charges, 0);
  assert.equal(app.state.modelCalls, 0);
});

test("interrupted model responses preserve partial text and never emit edits", async () => {
  const app = host({ paid: true, failStream: true, chunks: ["Partial response"] });
  const emitted = events(await (await app.send()).text());
  assert.equal(app.rows[0].status, "interrupted");
  assert.match(app.rows[0].assistantText, /Partial response/);
  assert.ok(emitted.some((event) => event.type === "interrupted"));
  assert.equal(emitted.some((event) => event.type === "adjustments"), false);
  assert.equal(app.state.charges, 0);
  const restored = messagesFromTurns((await (await app.get()).json()).turns);
  assert.equal(restored[1].interrupted, true);
});

test("a paid reply charges after saving and reports the settled balance", async () => {
  const app = host({ paid: true, chunks: ["A usable reply."] });
  const emitted = events(await (await app.send()).text());
  assert.equal(app.rows[0].status, "complete");
  assert.equal(app.state.charges, 1);
  assert.equal(emitted.filter((event) => event.type === "meta").at(-1).creditBalanceAfter, 9);
});

test("leaving mid-stream preserves the user message and partial response", async () => {
  const controller = new AbortController();
  const app = host({ afterChunk: () => controller.abort(), chunks: ["Saved partial", "Never emitted"] });
  const response = await app.send({}, controller.signal);
  // Cancellation closes the reader; the server's abort handler still finalizes storage.
  await response.body.cancel();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(app.rows[0].status, "interrupted");
  assert.equal(app.rows[0].userText, "Make it brighter");
});

test("final save failure is visible and cannot emit edit instructions", async () => {
  const app = host({ failUpdate: true });
  const emitted = events(await (await app.send()).text());
  assert.ok(emitted.some((event) => event.type === "history_error"));
  assert.equal(emitted.some((event) => event.type === "adjustments"), false);
  assert.equal(app.rows[0].status, "streaming");
  const restored = messagesFromTurns((await (await app.get()).json()).turns);
  assert.equal(restored[1].interrupted, true, "stale pending turns must not become endless spinners");
});

test("saved and streaming display remove complete and interrupted tool payloads", () => {
  assert.equal(cleanChatText('Text [adjustments]{"exposure":'), "Text");
  assert.equal(cleanChatText('Text [adjustments]{"exposure":4}[/adjustments]'), "Text");
});

// Mount the real hydration hook in a minimal React host; network responses are controlled.
function historyHookHost() {
  const { useImageChatHistory } = load("../hooks/useImageChatHistory.ts");
  const React = nativeRequire("react");
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
    useEffect() { cursor++; },
  };
  return () => {
    cursor = 0;
    const internals = React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
    const previous = internals.H;
    internals.H = dispatcher;
    try { return useImageChatHistory("photo-a"); }
    finally { internals.H = previous; }
  };
}
const savedTurn = (sequence) => ({ id: `turn-${sequence}`, sequence, userText: `User ${sequence}`, assistantText: `Agent ${sequence}`,
  attachmentUrl: null, status: "complete", createdAt: new Date().toISOString() });

test("editor hydration restores history, prepends older pages without duplicates and retries failures", async () => {
  const originalFetch = globalThis.fetch;
  try {
    const render = historyHookHost();
    assert.equal(render().historyLoaded, false);
    globalThis.fetch = async () => new Response(null, { status: 503 });
    await render().loadHistory();
    assert.equal(render().historyLoaded, false);
    assert.ok(render().historyError);
    globalThis.fetch = async () => Response.json({ turns: [savedTurn(3)], beforeCursor: 3 });
    await render().loadHistory();
    assert.equal(render().historyLoaded, true);
    assert.equal(render().historyError, null);
    assert.equal(render().messages.length, 2);
    globalThis.fetch = async () => Response.json({ turns: [savedTurn(2), savedTurn(3)], beforeCursor: null });
    await render().loadHistory(3);
    assert.deepEqual(render().messages.map((message) => message.content), ["User 2", "Agent 2", "User 3", "Agent 3"]);
  } finally { globalThis.fetch = originalFetch; }
});

test("superseded hydration responses cannot replace the current conversation", async () => {
  const originalFetch = globalThis.fetch;
  try {
    const render = historyHookHost();
    let resolveOlder;
    globalThis.fetch = () => new Promise((resolve) => { resolveOlder = resolve; });
    const first = render().loadHistory();
    globalThis.fetch = async () => Response.json({ turns: [savedTurn(5)], beforeCursor: null });
    await render().loadHistory();
    resolveOlder(Response.json({ turns: [savedTurn(1)], beforeCursor: null }));
    await first;
    assert.equal(render().messages[0].content, "User 5");
  } finally { globalThis.fetch = originalFetch; }
});


test("long responses checkpoint at bounded intervals instead of writing every token", async () => {
  let now = 0;
  class Clock extends Date { static now() { return now; } }
  const app = host({ clock: Clock, chunks: Array(24).fill("text "), afterChunk: () => { now += 250; } });
  await (await app.send()).text();
  assert.ok(app.state.updates >= 2, "long responses need recovery checkpoints");
  assert.ok(app.state.updates <= 4, "writes should be throttled across chunks");
  assert.equal(app.rows[0].status, "complete");
});

test("Ask replies restore the same nudge and cannot apply adjustments", async () => {
  const app = host();
  const emitted = events(await (await app.send({ chatInteractionMode: "ask" })).text());
  assert.equal(emitted.some((event) => event.type === "adjustments"), false);
  const live = cleanChatText(emitted.filter((event) => event.type === "text").map((event) => event.text).join(""));
  const stored = messagesFromTurns((await (await app.get()).json()).turns)[1].content;
  assert.equal(stored, live);
});

const { createChatProgressParser, CHAT_PROGRESS_LABELS } = load("../lib/chat-progress.ts");

test("task-specific progress streams separately and never enters saved answers or model context", async () => {
  const app = host({ chunks: ["[pro", "gress]I'll warm the colors and lift the shadows.", "[/pro", "gress]Warmer colors applied. ", '[adjustments]{"temperature":15}[/adjustments]'] });
  const emitted = events(await (await app.send()).text());
  const progress = emitted.filter((event) => event.type === "progress").map((event) => event.text);
  assert.deepEqual(progress, [CHAT_PROGRESS_LABELS.waiting, "I'll warm the colors and lift the shadows."]);
  assert.equal(emitted.filter((event) => event.type === "text").map((event) => event.text).join("").includes("[progress]"), false);
  assert.equal(app.rows[0].assistantText, "Warmer colors applied.");
  assert.equal(app.rows[0].status, "complete");
  assert.equal(app.state.modelCalls, 1);
  assert.equal(app.state.charges, 1);
  const context = await app.history.readChatContext("photo-a", "user-a");
  assert.equal(context[1].content, "Warmer colors applied.");
  assert.ok(emitted.some((event) => event.type === "adjustments"));
});

test("progress parser handles every tag boundary while ordinary answers stream immediately", () => {
  const source = "  [progress]I’ll review the lighting.[/progress]Here is my advice.";
  for (let split = 0; split <= source.length; split++) {
    const parser = createChatProgressParser();
    const result = [...parser.push(source.slice(0, split)), ...parser.push(source.slice(split)), ...parser.finish()];
    assert.equal(result.filter((event) => event.type === "progress")[0].text, "I’ll review the lighting.");
    assert.equal(result.filter((event) => event.type === "text").map((event) => event.text).join(""), "Here is my advice.");
  }
  const parser = createChatProgressParser();
  assert.deepEqual(parser.push("An ordinary answer."), [{ type: "text", text: "An ordinary answer." }]);
  assert.deepEqual(parser.finish(), []);
});

test("incomplete or oversized progress cannot hang, expose protocol text or apply edits", async () => {
  for (const chunks of [["[progress]unfinished"], ["[progress]" + "a".repeat(513)]]) {
    const app = host({ chunks });
    const emitted = events(await (await app.send()).text());
    assert.equal(app.rows[0].status, "interrupted");
    assert.ok(emitted.some((event) => event.type === "interrupted"));
    assert.equal(emitted.some((event) => event.type === "adjustments"), false);
    assert.equal(emitted.filter((event) => event.type === "text").some((event) => event.text.includes("[progress]")), false);
  }
});

test("oversized progress preserves the answer across closing tag boundaries", async () => {
  for (let split = 0; split <= "[/progress]".length; split++) {
    const app = host({ chunks: ["[progress]" + "a".repeat(600),
      "[/progress]".slice(0, split), "[/progress]".slice(split) + "The exposure looks balanced."] });
    const result = events(await (await app.send({ chatInteractionMode: "ask" })).text());
    assert.equal(app.rows[0].status, "complete");
    assert.match(app.rows[0].assistantText, /The exposure looks balanced/);
    assert.equal(result.some((event) => event.type === "interrupted"), false);
    assert.equal(result.filter((event) => event.type === "text").map((event) => event.text).join("").includes("[progress]"), false);
    assert.equal(app.state.charges, 1);
  }
});

test("restoring saved transcripts strips progress from completed and interrupted messages", () => {
  assert.equal(cleanChatText("[progress]I'll brighten the subject.[/progress]Done. [adjustments]{}[/adjustments]"), "Done.");
  assert.equal(cleanChatText("[progress]An interrupted summary"), "");
});

test("Ask starts with waiting; photo preparation is exclusive to Agent mode", () => {
  const { initialChatProgress } = load("../lib/chat-progress.ts");
  assert.equal(initialChatProgress("ask", true), CHAT_PROGRESS_LABELS.waiting);
  assert.equal(initialChatProgress("ask", false), CHAT_PROGRESS_LABELS.waiting);
  assert.equal(initialChatProgress("agent", true), CHAT_PROGRESS_LABELS.preparingPhoto);
  assert.equal(initialChatProgress("agent", false), CHAT_PROGRESS_LABELS.waiting);
});

/** Exercise the real chat component's event handlers without editing a real photo. */
function chatPanelHost(mode, options = {}) {
  const React = nativeRequire("react");
  const slots = [];
  let cursor = 0;
  let messages = [];
  let network;
  const edits = [];
  const response = options.response ?? new Response(new ReadableStream({ start(controller) { network = controller; } }));
  const constants = load("../constants/chat-interaction-mode.ts");
  const historyHook = () => ({ messages,
    setMessages(value) { messages = typeof value === "function" ? value(messages) : value; },
    historyLoaded: true, historyLoading: false, historyError: null, beforeCursor: null, loadHistory: async () => true,
  });
  const component = compile("../components/editor/ChatPanel.tsx", {
    "next/dynamic": { default: () => () => null },
    "@/components/shared/BrandLogo": { default: () => null },
    "@/constants/brand": { BRAND_LOGO_IMAGE: { src: "/logo.png", width: 40, height: 40 } },
    "@/components/editor/ChatEmptyState": { default: () => null },
    "@clerk/nextjs": { useUser: () => ({ user: null }) },
    "framer-motion": { ...nativeRequire("framer-motion"), useReducedMotion: () => options.reduceMotion === true },
    "react-dom": { flushSync: (callback) => callback(), createPortal: (children) => children },
    "@/hooks/useImageChatHistory": { useImageChatHistory: historyHook },
    "@/lib/create-uuid": { createUuid: options.createUuid ?? (() => turnId) },
    "@/hooks/useEditorChatTools": { chatToolsRequest: async () => ({ ok: true }) },
    "@/constants/chat-interaction-mode": { ...constants, DEFAULT_CHAT_INTERACTION_MODE: mode },
    __globals: { TextDecoder, DOMException, crypto: { randomUUID: () => turnId },
      fetch: async (url) => url === "/api/ai/chat" ? response : Response.json({ lifetimeFreeAI: 0, creditBalance: 10 }) },
  }).default;
  const dispatcher = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
      return [slots[index], (value) => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }];
    },
    useRef(initial) { const index = cursor++; return slots[index] ??= { current: initial }; },
    useCallback(callback) { cursor++; return callback; },
    useContext() { cursor++; return false; },
    useEffect() { cursor++; }, useLayoutEffect() { cursor++; },
  };
  function render() {
    cursor = 0;
    const internals = React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
    const previous = internals.H;
    internals.H = dispatcher;
    try { return component({ adjustments: {}, imageId: "photo-a", canvasImageUrl: "https://example.com/photo.jpg",
      onPatch(patch) { assert.equal(messages.at(-1).content, "", "explanation must stay hidden until edits commit"); edits.push(patch); return true; },
      createEditGuard: () => () => true, createChatEditGuard: () => () => true,
      beginOperation: () => () => {}, onUndo() {},
      ...options,
    }); } finally { internals.H = previous; }
  }
  function find(predicate, ...nodes) {
    const node = nodes.length ? nodes[0] : render();
    if (!node || typeof node !== "object") return undefined;
    if (Array.isArray(node)) { for (const child of node) { const found = find(predicate, child); if (found) return found; } return undefined; }
    if (predicate(node)) return node;
    return find(predicate, node.props?.children);
  }
  const label = () => find((node) => node.type?.name === "ShimmerText")?.props.label;
  async function sendEvent(event) {
    network.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`));
    await new Promise((resolve) => setImmediate(resolve));
  }
  return { render, find, label, edits, messages: () => messages, sendEvent,
    async submit() {
      find((node) => node.type === "textarea").props.onChange({ target: { value: "Help with the lighting" } });
      find((node) => node.type === "button" && node.props.title === "Send").props.onClick();
      await new Promise((resolve) => setImmediate(resolve));
    },
    async finish() { await sendEvent({ type: "done" }); network.close(); await new Promise((resolve) => setImmediate(resolve)); },
  };
}

test("task summary leads; Ask reveals the final advice only when ready and never edits", async () => {
  const panel = chatPanelHost("ask");
  await panel.submit();
  assert.equal(panel.label(), CHAT_PROGRESS_LABELS.waiting);
  await panel.sendEvent({ type: "progress", text: "Thinking..." });
  assert.equal(panel.label(), "Thinking...");
  await panel.sendEvent({ type: "progress", text: "I'll consider how to balance the lighting." });
  await panel.sendEvent({ type: "text", text: "Try lifting the shadows." });
  assert.equal(panel.messages().at(-1).content, "");
  assert.equal(panel.label(), "I'll consider how to balance the lighting.");
  await panel.sendEvent({ type: "adjustments", adjustments: { shadows: 20 } });
  await panel.finish();
  assert.equal(panel.messages().at(-1).content, "Try lifting the shadows.");
  assert.equal(panel.label(), undefined, "progress must not sit below the final answer");
  assert.equal(panel.edits.length, 0);
});

test("Agent commits changes before revealing the explanation and clears temporary progress", async () => {
  const panel = chatPanelHost("agent");
  await panel.submit();
  assert.equal(panel.label(), CHAT_PROGRESS_LABELS.preparingPhoto);
  await panel.sendEvent({ type: "progress", text: "I'll brighten the subject." });
  await panel.sendEvent({ type: "text", text: "Lifted the shadows." });
  await panel.sendEvent({ type: "adjustments", adjustments: { shadows: 20 } });
  assert.equal(panel.messages().at(-1).content, "");
  assert.equal(panel.edits.length, 0);
  await panel.finish();
  assert.equal(panel.edits.length, 1);
  assert.equal(panel.messages().at(-1).content, "Lifted the shadows.");
  assert.equal(panel.label(), undefined);
});

test("interrupted staged replies retain partial text without applying buffered edits", async () => {
  const panel = chatPanelHost("agent");
  await panel.submit();
  await panel.sendEvent({ type: "progress", text: "I'll lift the shadows." });
  await panel.sendEvent({ type: "text", text: "Partial explanation." });
  await panel.sendEvent({ type: "adjustments", adjustments: { shadows: 20 } });
  await panel.sendEvent({ type: "interrupted" });
  await panel.finish();
  assert.equal(panel.edits.length, 0);
  assert.equal(panel.messages().at(-1).content, "Partial explanation.");
  assert.equal(panel.messages().at(-1).interrupted, true);
  assert.equal(panel.label(), undefined);
});


test("Agent requests native validated tools without charging or executing paid operations during planning", async () => {
  const plan = { actions: [{ type: "remove_background" }, { type: "rotate", degrees: 90 }] };
  const app = host({ paid: true, chunks: [], modelEvents: [
    { type: "content_block_start", index: 1, content_block: { type: "tool_use", name: "edit_photo" } },
    { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: JSON.stringify(plan).slice(0, 20) } },
    { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: JSON.stringify(plan).slice(20) } },
  ] });
  const result = events(await (await app.send({ toolsEnabled: true })).text());
  assert.equal(app.state.modelTools[0].name, "edit_photo");
  assert.equal(app.state.charges, 0, "planning does not deliver a billable edit");
  assert.equal(app.state.toolPlans.length, 1);
  assert.equal(result.find((e) => e.type === "tools").plan.credits, 1);
  assert.equal(result.some((e) => e.type === "adjustments"), false);
  assert.match(app.rows[0].assistantText, /not been confirmed as applied/);
  assert.notEqual(app.rows[0].status, "complete");
});

test("an unfinished progress summary cannot interrupt a valid Agent edit plan", async () => {
  const plan = { actions: [{ type: "adjust", values: { exposure: 12 } }] };
  const app = host({ chunks: [], modelEvents: [
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "[progress]" + "Preparing the lighting changes...".repeat(30) } },
    { type: "content_block_start", index: 1, content_block: { type: "tool_use", name: "edit_photo" } },
    { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: JSON.stringify(plan) } },
  ] });
  const result = events(await (await app.send({ toolsEnabled: true })).text());
  assert.deepEqual(result.find((event) => event.type === "tools")?.plan.actions, plan.actions);
  assert.equal(app.state.toolPlans.length, 1);
  assert.equal(result.some((event) => event.type === "interrupted"), false);
  assert.equal(result.some((event) => event.type === "text" && event.text.includes("[progress]")), false);
});

test("Ask never receives tools and rejects a model-invented tool call", async () => {
  const app = host({ chunks: [], modelEvents: [
    { type: "content_block_start", index: 0, content_block: { type: "tool_use", name: "edit_photo" } },
  ] });
  const result = events(await (await app.send({ toolsEnabled: true, chatInteractionMode: "ask" })).text());
  assert.equal(app.state.modelTools.length, 0);
  assert.equal(app.state.toolPlans.length, 0);
  assert.equal(result.some((e) => e.type === "tools"), false);
  assert.equal(result.some((e) => e.type === "interrupted"), true);
});

test("invalid or truncated tool plans never become executable", async () => {
  for (const truncated of [false, true]) {
    const app = host({ chunks: [], modelEvents: [
      { type: "content_block_start", index: 0, content_block: { type: "tool_use", name: "edit_photo" } },
      { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify({ actions: [{ type: "rotate", degrees: truncated ? 90 : 777 }] }) } },
      ...(truncated ? [{ type: "message_delta", delta: { stop_reason: "max_tokens" } }] : []),
    ] });
    const result = events(await (await app.send({ toolsEnabled: true })).text());
    assert.equal(app.state.toolPlans.length, 0);
    assert.equal(result.some((e) => e.type === "tools"), false);
    assert.equal(result.some((e) => e.type === "interrupted"), true);
  }
});


test("free native actions execute before the final explanation is revealed", async () => {
  let calls = 0;
  const panel = chatPanelHost("agent", { onExecuteTools: async () => {
    calls++; assert.equal(panel.messages().at(-1).content, ""); return "Rotate 90° completed.";
  } });
  await panel.submit();
  await panel.sendEvent({ type: "tools", plan: { turnId, credits: 0, actions: [{ type: "rotate", degrees: 90 }] } });
  assert.equal(calls, 0);
  await panel.finish();
  assert.equal(calls, 1);
  assert.equal(panel.messages().at(-1).content, "Rotate 90° completed.");
});

test("free edit reviews stay hidden during execution and enter after the final reply", async () => {
  let release;
  const panel = chatPanelHost("agent", { onExecuteTools: async (_plan, execution) => {
    execution.reviewChanges({ changes: [{ key: "exposure", label: "Exposure", from: 0, to: 15 }],
      canUndo: () => true, undo: async () => {}, includesPaidTools: false });
    await new Promise((resolve) => { release = resolve; });
    return "Brightened the image and lifted the shadows.";
  } });
  await panel.submit();
  await panel.sendEvent({ type: "tools", plan: { turnId, credits: 0, actions: [{ type: "adjust", values: { exposure: 15 } }] } });
  await panel.finish();
  assert.equal(panel.messages().at(-1).content, "");
  assert.equal(panel.find((node) => node.key === "chat-changes"), undefined, "never show the review while saving or thinking");
  release();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(panel.messages().at(-1).content, "Brightened the image and lifted the shadows.");
  const notice = panel.find((node) => node.key === "chat-changes");
  assert.ok(notice);
  assert.equal(notice.props.initial.y, 8);
  assert.equal(notice.props.initial.opacity, 0);
  assert.equal(notice.props.animate.opacity, 1);
  assert.equal(notice.props.transition.duration, 0.12);
  assert.equal(notice.props.transition.delay, 0.4, "wait for the thinking exit and message entrance");
  assert.equal(notice.props.exit.transition.delay, 0);
});

test("approved paid edit reviews also wait for the reply and respect reduced motion", async () => {
  let release;
  const panel = chatPanelHost("agent", { reduceMotion: true, onExecuteTools: async (_plan, execution) => {
    execution.reviewChanges({ changes: [{ key: "background", label: "Remove background", to: "Applied" }],
      canUndo: () => true, undo: async () => {}, includesPaidTools: true });
    await new Promise((resolve) => { release = resolve; });
    return "Removed the background.";
  } });
  await panel.submit();
  await panel.sendEvent({ type: "tools", plan: { turnId, credits: 1, actions: [{ type: "remove_background" }] } });
  await panel.finish();
  const approve = panel.find((node) => node.type === "button" && Array.isArray(node.props.children) && node.props.children[0] === "Apply · ");
  approve.props.onClick();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(panel.find((node) => node.key === "chat-changes"), undefined);
  release();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(panel.messages().at(-1).content, "Removed the background.");
  const notice = panel.find((node) => node.key === "chat-changes");
  assert.ok(notice);
  assert.equal(notice.props.transition.duration, 0);
  assert.equal(notice.props.transition.delay, 0);
  assert.equal(notice.props.initial.y, 0);
  panel.find((node) => node.type === "button" && node.props["aria-label"] === "Expand changes").props.onClick();
  assert.equal(panel.find((node) => node.key === "chat-change-details").props.transition.duration, 0);
});

test("paid plans display their costs and require approval before execution", async () => {
  let calls = 0;
  const panel = chatPanelHost("agent", { onExecuteTools: async () => { calls++; return "Remove background completed."; } });
  await panel.submit();
  await panel.sendEvent({ type: "tools", plan: { turnId, credits: 1, actions: [{ type: "remove_background" }] } });
  await panel.finish();
  assert.equal(calls, 0);
  const approve = panel.find((node) => node.type === "button" && Array.isArray(node.props.children) && node.props.children[0] === "Apply · ");
  assert.ok(approve);
  await approve.props.onClick();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 1);
  assert.equal(panel.messages().at(-1).content, "Remove background completed.");
});

test("Ask and interrupted streams cannot execute native actions", async () => {
  for (const mode of ["ask", "agent"]) {
    let calls = 0;
    const panel = chatPanelHost(mode, { onExecuteTools: async () => { calls++; return "done"; } });
    await panel.submit();
    await panel.sendEvent({ type: "tools", plan: { turnId, credits: 0, actions: [{ type: "rotate", degrees: 90 }] } });
    if (mode === "agent") await panel.sendEvent({ type: "interrupted" });
    await panel.finish();
    assert.equal(calls, 0);
  }
});

test("mobile chat reuses desktop drafts and opens even if the desktop panel was collapsed", () => {
  let closes = 0;
  const options = { mobileLayout: false, onMobileClose: () => { closes++; } };
  const panel = chatPanelHost("agent", options);
  panel.find((node) => node.type === "textarea").props.onChange({ target: { value: "Keep this draft" } });
  panel.find((node) => node.props?.["aria-label"] === "Collapse chat panel").props.onClick();
  assert.equal(panel.find((node) => node.type === "textarea"), undefined);
  options.mobileLayout = true;
  assert.equal(panel.find((node) => node.type === "textarea").props.value, "Keep this draft");
  panel.find((node) => node.props?.["aria-label"] === "Close chat panel").props.onClick();
  assert.equal(closes, 1);
  options.mobileLayout = false;
  assert.equal(panel.find((node) => node.type === "textarea"), undefined, "desktop collapse preference remains intact");
});


test("mobile chat accepts text and sends suggestion prompts when randomUUID is unavailable", async () => {
  const { createUuid } = compile("../lib/create-uuid.ts", {
    __globals: { crypto: { getRandomValues: (array) => array.fill(7) } },
  });
  const panel = chatPanelHost("ask", { mobileLayout: true, createUuid });
  const input = () => panel.find((node) => node.type === "textarea");
  assert.equal(input().props.disabled, false);
  input().props.onFocus();
  input().props.onChange({ target: { value: "Make it warmer" } });
  assert.equal(input().props.value, "Make it warmer");
  input().props.onBlur();
  const suggestions = panel.find((node) => typeof node.props?.onSelectSuggestion === "function");
  assert.equal(suggestions.props.disabled, false);
  suggestions.props.onSelectSuggestion("Balance the colors");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(panel.messages()[0].content, "Balance the colors");
  assert.match(panel.messages()[0].id, /^[0-9a-f-]{36}:user$/);
  await panel.finish();
});


test("Agent recovers a permission-only reply into a free edit plan with one chat charge", async () => {
  const plan = { actions: [{ type: "adjust", values: { exposure: 25, shadows: 15 } }] };
  const app = host({ modelAttempts: [
    { chunks: ["Would you like me to apply these changes?"] },
    { chunks: [], modelEvents: [
      { type: "content_block_start", index: 0, content_block: { type: "tool_use", name: "edit_photo" } },
      { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify(plan) } },
    ] },
  ] });
  const result = events(await (await app.send({ toolsEnabled: true })).text());
  assert.equal(app.state.modelCalls, 2);
  assert.equal(app.state.charges, 1);
  assert.equal(app.state.toolPlans.length, 1);
  assert.equal(app.state.modelConfigs[1].tool_choice.type, "tool");
  assert.equal(app.state.modelConfigs[1].tool_choice.name, "edit_photo");
  const prepared = result.find((event) => event.type === "tools").plan;
  assert.equal(prepared.credits, 0, "free sliders must not trigger the paid approval path");
  assert.deepEqual(prepared.actions, plan.actions);
  assert.ok(result.some((event) => event.type === "done"));
});

test("Agent recovery is bounded and Ask permission replies never trigger tools", async () => {
  const question = "Would you like me to apply these changes?";
  const agent = host({ chunks: [question] });
  const result = events(await (await agent.send({ toolsEnabled: true })).text());
  assert.equal(agent.state.modelCalls, 2);
  assert.equal(agent.state.toolPlans.length, 0);
  assert.ok(result.some((event) => event.type === "interrupted"));
  const ask = host({ chunks: [question] });
  await (await ask.send({ toolsEnabled: true, chatInteractionMode: "ask" })).text();
  assert.equal(ask.state.modelCalls, 1);
  assert.equal(ask.state.toolPlans.length, 0);
});

test("current mode is explicit while historical modes remain attached to earlier turns", async () => {
  for (const mode of ["agent", "ask"]) {
    const previousMode = mode === "agent" ? "ask" : "agent";
    const rows = [{ id: "earlier-turn", sequence: 1, imageId: "photo-a", mode: previousMode,
      userText: "Suggest a warmer look", assistantText: "To apply changes, switch to Agent.",
      status: "complete", attachmentUrl: null, createdAt: new Date() }];
    const app = host({ rows, chunks: ["The lighting looks balanced."] });
    await (await app.send({ userMessage: "Hello", chatInteractionMode: mode, toolsEnabled: true })).text();
    const label = mode === "agent" ? "Agent" : "Ask";
    const previousLabel = previousMode === "agent" ? "Agent" : "Ask";
    assert.ok(app.state.modelConfigs[0].system.startsWith(`CURRENT INTERACTION MODE: ${label}.`));
    assert.ok(app.state.modelMessages[0].content.startsWith(`[Historical ${previousLabel} mode turn]`));
    assert.ok(app.state.modelMessages[1].content.startsWith(`[Historical ${previousLabel} mode turn]`));
    assert.ok(app.state.modelMessages.at(-1).content.at(-1).text.startsWith(`Current interaction mode: ${label}.`));
    const transcript = await (await app.get()).json();
    assert.equal(transcript.turns[0].assistantText, "To apply changes, switch to Agent.");
    if (mode === "ask") assert.equal(app.state.modelTools.length, 0);
  }
});

test("Agent recovers omitted tools and mistaken Ask replies for direct edits", async () => {
  const plan = { actions: [{ type: "adjust", values: { temperature: 15 } }] };
  for (const reply of ["Switch to Agent mode to apply these changes.", "I recommend warmer colors.", "I made the photo warmer."]) {
    const app = host({ modelAttempts: [
      { chunks: [reply] },
      { chunks: [], modelEvents: [
        { type: "content_block_start", index: 0, content_block: { type: "tool_use", name: "edit_photo" } },
        { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify(plan) } },
      ] },
    ] });
    const result = events(await (await app.send({ userMessage: "Make the photo warmer", toolsEnabled: true })).text());
    assert.equal(app.state.modelCalls, 2);
    assert.deepEqual(result.find((event) => event.type === "tools")?.plan.actions, plan.actions);
    assert.equal(app.state.charges, 1);
    assert.ok(!app.rows[0].assistantText.includes(reply), "unverified draft must not become a saved completion claim");
  }
});

test("Agent recovery leaves missing inputs, genuine questions and non-edit requests alone", async () => {
  for (const [userMessage, reply] of [
    ["Crop the photo", "Which subject should I keep?"],
    ["Match this style", "Please attach the reference image."],
    ["Match this style", "I need a reference image first."],
    ["Remove the object", "A painted selection is required."],
    ["What is exposure?", "Exposure controls brightness."],
    ["Don't apply changes, explain exposure", "Exposure controls brightness."],
  ]) {
    const app = host({ chunks: [reply] });
    await (await app.send({ userMessage, toolsEnabled: true })).text();
    assert.equal(app.state.modelCalls, 1, userMessage);
    assert.equal(app.state.toolPlans.length, 0);
  }
});

test("Agent requires an edit plan for photo style and advice questions; Ask stays text-only", async () => {
  const plan = { actions: [{ type: "adjust", values: { contrast: 12, highlights: -15, temperature: -8 } }] };
  for (const userMessage of [
    "What mood or style would suit this photo?",
    "what do you recommend for this image?",
    "Does the exposure or color balance look off?",
    "How does this photo look?",
  ]) {
    const modelEvents = [
      { type: "content_block_start", index: 0, content_block: { type: "tool_use", name: "edit_photo" } },
      { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify(plan) } },
    ];
    const agent = host({ chunks: [], modelEvents });
    const response = await agent.send({ userMessage, toolsEnabled: true });
    let applications = 0;
    const panel = chatPanelHost("agent", { response, onExecuteTools: async (prepared) => {
      applications++;
      assert.deepEqual(prepared.actions, plan.actions);
      return "Applied a cool cinematic look.";
    } });
    await panel.submit();
    assert.equal(agent.state.modelConfigs[0].tool_choice.type, "tool", userMessage);
    assert.equal(applications, 1, userMessage);
    assert.equal(panel.messages().at(-1).content, "Applied a cool cinematic look.");

    const ask = host({ chunks: ["A cool cinematic look would suit this photo."] });
    const result = events(await (await ask.send({ userMessage, toolsEnabled: true, chatInteractionMode: "ask" })).text());
    assert.equal(ask.state.modelTools.length, 0);
    assert.equal(result.some((event) => event.type === "tools" || event.type === "adjustments"), false);
  }
});

test("Agent retries aesthetic preference questions instead of waiting for permission to choose a look", async () => {
  const plan = { actions: [{ type: "adjust", values: { contrast: 12 } }] };
  const app = host({ modelAttempts: [
    { chunks: ["Which direction appeals to you? Select a cinematic or airy look and I can apply it."] },
    { chunks: [], modelEvents: [
      { type: "content_block_start", index: 0, content_block: { type: "tool_use", name: "edit_photo" } },
      { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify(plan) } },
    ] },
  ] });
  const result = events(await (await app.send({ userMessage: "What mood or style would suit this photo?", toolsEnabled: true })).text());
  assert.equal(app.state.modelCalls, 2);
  assert.equal(result.some((event) => event.type === "tools"), true);
  assert.equal(app.state.charges, 1);
});

test("switching from Agent history to Ask cannot emit or execute adjustments", async () => {
  const rows = [{ id: "agent-turn", sequence: 1, imageId: "photo-a", mode: "agent",
    userText: "Make it warmer", assistantText: "Warmed the photo.", status: "complete", createdAt: new Date() }];
  const app = host({ rows, chunks: ['I applied the changes. [adjustments]{"temperature":20}[/adjustments]'] });
  const result = events(await (await app.send({ userMessage: "Apply these changes", chatInteractionMode: "ask", toolsEnabled: true })).text());
  assert.equal(app.state.modelCalls, 1);
  assert.equal(app.state.modelTools.length, 0);
  assert.equal(result.some((event) => event.type === "adjustments" || event.type === "tools"), false);
});

test("Agent permission recovery preserves real clarification questions", () => {
  const { agentReplyRequestsEditPermission } = load("../lib/chat-edit-intent.ts");
  assert.equal(agentReplyRequestsEditPermission("Should I brighten your image?"), true);
  assert.equal(agentReplyRequestsEditPermission("Would you like me to apply these adjustments?"), true);
  assert.equal(agentReplyRequestsEditPermission("Should I crop the left or right side?"), false);
  assert.equal(agentReplyRequestsEditPermission("Which area should I edit?"), false);
  assert.equal(agentReplyRequestsEditPermission("Would you like me to explain the histogram?"), false);
});


test("mobile Agent turns a permission-only model reply into automatically applied slider edits", async () => {
  const plan = { actions: [{ type: "adjust", values: { exposure: 25 } }] };
  const server = host({ modelAttempts: [
    { chunks: ["Would you like me to apply these changes?"] },
    { chunks: [], modelEvents: [
      { type: "content_block_start", index: 0, content_block: { type: "tool_use", name: "edit_photo" } },
      { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify(plan) } },
    ] },
  ] });
  let exposure = 0, applications = 0;
  const panel = chatPanelHost("agent", { mobileLayout: true, response: await server.send({ toolsEnabled: true }),
    onExecuteTools: async (prepared) => {
      applications++; exposure = prepared.actions[0].values.exposure;
      return "Brightened your photo.";
    },
  });
  await panel.submit();
  assert.equal(applications, 1);
  assert.equal(exposure, 25);
  assert.equal(panel.messages().at(-1).content, "Brightened your photo.");
  assert.equal(server.state.charges, 1);
});
