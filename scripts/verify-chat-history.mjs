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
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const routeModule = { exports: {} };
  vm.runInNewContext(code, { module: routeModule, exports: routeModule.exports,
    Request, Response, URL, Buffer, TextEncoder, ReadableStream, AbortController,
    Date: adapters.__clock ?? Date,
    console: { ...console, error() {} },
    require: (id) => adapters[id] ?? (id.startsWith("@/") ? load(`../${id.slice(2)}.ts`) : nativeRequire(id)),
  });
  return routeModule.exports;
}
const turnId = "b501765b-7815-4a8a-986d-43ab939294b9";
function host(options = {}) {
  const rows = options.rows ?? [];
  const state = { modelCalls: 0, charges: 0, refunds: 0, updates: 0, uploads: 0, modelMessages: [] };
  const matches = (row, where) => row.imageId === where.imageId && where.image.userId === "user-a" &&
    row.imageId === "photo-a" && (!where.status || row.status === where.status) &&
    (!where.sequence || row.sequence < where.sequence.lt);
  const prisma = {
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
    : { user: { id: "user-a", lifetimeFreeAI: options.paid ? 20 : 0, creditBalance: 10 } } };
  const history = compile("../lib/chat-history.ts", { "@/lib/prisma": { prisma } });
  const adapters = {
    __clock: options.clock,
    "@/lib/prisma": { prisma }, "@/lib/require-user": auth, "@/lib/chat-history": history,
    "@/lib/anthropic": {
      formatAdjustmentsForPrompt: () => "Current adjustments", anthropic: { messages: { stream({ messages }) {
        state.modelCalls++; state.modelMessages = messages;
        let aborted = false;
        return {
          abort() { aborted = true; },
          async *[Symbol.asyncIterator]() {
            for (const text of options.chunks ?? ['Done. ', '[adjustments]{"exposure":12}[/adjustments]']) {
              if (aborted) throw new Error("aborted");
              yield { type: "content_block_delta", delta: { type: "text_delta", text } };
              options.afterChunk?.();
            }
            if (options.failStream || aborted) throw new Error("model interrupted");
          },
        };
      } } },
    },
    "@/lib/kv": { checkRateLimit: async () => null, checkRateLimitPerMinute: async () => null, RATE_LIMIT_MINUTE: {} },
    "@/lib/expensive-route-guard": { rateLimitDeniedResponse: () => null },
    "@/lib/atomic-credits": { chargeCreditFeature: async () => { state.charges++; return { ok: true, balanceAfter: 9 }; },
      insufficientCreditsResponse: () => new Response(null, { status: 402 }), refundCreditFeature: async () => { state.refunds++; } },
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
  assert.equal(app.state.refunds, 1);
  const restored = messagesFromTurns((await (await app.get()).json()).turns);
  assert.equal(restored[1].interrupted, true);
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
