import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { randomFillSync } from "node:crypto";
import vm from "node:vm";
import ts from "typescript";
import sharp from "sharp";
import { require as tsxRequire } from "tsx/cjs/api";

const nativeRequire = createRequire(import.meta.url);
const load = (path) => tsxRequire(path, import.meta.url);
const { prepareChatVisionBase64, VISION_BASE64_MAX_BYTES, VisionImageError } = load("../lib/chat-image-vision-server.ts");
function compile(path, adapters = {}, globals = {}) {
  const mod = { exports: {} };
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, { module: mod, exports: mod.exports, Buffer, Request, Response, Headers, URL,
    console: { error() {} }, ...globals,
    require: (id) => adapters[id] ?? (id.startsWith("@/") ? load(`../${id.slice(2)}`) : nativeRequire(id)),
  });
  return mod.exports;
}
const imageUrl = "https://app.ufs.sh/f/original-image";
const fixture = () => sharp({ create: { width: 180, height: 120, channels: 4, background: { r: 70, g: 110, b: 160, alpha: 0.6 } } }).png().toBuffer();
async function checkImage(image) {
  assert.ok(image.base64.length <= VISION_BASE64_MAX_BYTES);
  const metadata = await sharp(Buffer.from(image.base64, "base64")).metadata();
  assert.ok(Math.max(metadata.width, metadata.height) <= 1000);
  assert.equal(image.mediaType, `image/${metadata.format}`);
}

test("JPEG, PNG, WebP and TIFF inputs are decoded into correctly labeled, bounded vision images", async () => {
  const source = await fixture();
  for (const format of ["jpeg", "png", "webp", "tiff"]) {
    const bytes = await sharp(source).toFormat(format).toBuffer();
    await checkImage(await prepareChatVisionBase64(bytes.toString("base64")));
  }
  await assert.rejects(prepareChatVisionBase64("aW52YWxpZA=="), VisionImageError);
});

test("the oversized target regression is resized below the encoded-byte limit", async () => {
  const pixels = randomFillSync(Buffer.alloc(2000 * 2000 * 3));
  const oversized = await sharp(pixels, { raw: { width: 2000, height: 2000, channels: 3 } }).png({ compressionLevel: 0 }).toBuffer();
  const encoded = oversized.toString("base64");
  assert.ok(encoded.length > 10 * 1024 * 1024);
  await checkImage(await prepareChatVisionBase64(encoded));
});

test("noisy alpha images fall back to bounded JPEG and EXIF orientation is applied once", async () => {
  const bytes = await sharp(randomFillSync(Buffer.alloc(1000 * 1000 * 4)), { raw: { width: 1000, height: 1000, channels: 4 } }).png().toBuffer();
  const prepared = await prepareChatVisionBase64(bytes.toString("base64"));
  assert.equal(prepared.mediaType, "image/jpeg");
  await checkImage(prepared);
  const rotated = await sharp(await fixture()).withMetadata({ orientation: 6 }).jpeg().toBuffer();
  const result = await prepareChatVisionBase64(rotated.toString("base64"));
  const metadata = await sharp(Buffer.from(result.base64, "base64")).metadata();
  assert.equal(metadata.width, 120); assert.equal(metadata.height, 180);
  assert.equal(metadata.orientation, undefined);
});

function routeHost({ source, reference, providerError, reply = '{"temperature":12,"contrast":8}', owned = true, limit } = {}) {
  const calls = { charges: 0, refunds: 0, provider: 0, fetches: [] };
  const context = compile("../lib/chat-image-context.ts", {
    "@/lib/safe-remote-fetch": { fetchTrustedMediaBuffer: async (url) => { calls.fetches.push(url); return { buffer: source, contentType: "image/jpeg" }; } },
  });
  const route = compile("../app/api/ai/style-match/route.ts", {
    "@/lib/require-user": { requireAuthUser: async () => ({ user: { id: "user-a", creditBalance: 50 } }) },
    "@/lib/verify-user-image": { assertUserOwnsImageUrl: async () => owned ? { id: "image-a" } : null },
    "@/lib/kv": {
      checkRateLimitPerMinute: async () => ({ allowed: limit !== "minute" }),
      checkRateLimit: async () => ({ allowed: limit !== "hour" }), RATE_LIMIT_MINUTE: { style_match: 5 },
    },
    "@/lib/chat-image-context": context,
    "@/lib/atomic-credits": {
      chargeCreditFeature: async () => { calls.charges++; return { ok: true }; },
      refundCreditFeature: async () => { calls.refunds++; },
    },
    "@/lib/anthropic": { anthropic: { messages: { create: async ({ messages }) => {
      calls.provider++;
      for (const block of messages[0].content.filter((item) => item.type === "image")) {
        await checkImage({ base64: block.source.data, mediaType: block.source.media_type });
      }
      if (providerError) throw providerError;
      return { content: [{ type: "text", text: reply }] };
    } } } },
  });
  const send = (target = imageUrl) => route.POST(new Request("https://redux.test/api/ai/style-match", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageUrl: target, referenceImageBase64: (reference ?? source).toString("base64"), referenceImageMediaType: "image/jpeg" }),
  }));
  return { calls, send, route, context };
}

test("all storage providers normalize actual target bytes instead of trusting a JPEG label", async () => {
  const source = await fixture();
  for (const url of [imageUrl, "https://utfs.io/f/image", "https://res.cloudinary.com/demo/image/upload/v1/original.png"]) {
    const app = routeHost({ source });
    const response = await app.send(url);
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).adjustments, { contrast: 8, temperature: 12 });
    assert.equal(app.calls.charges, 1); assert.equal(app.calls.refunds, 0);
    assert.equal(app.calls.provider, 1);
  }
});

test("invalid target/reference images and missing ownership never charge or call Claude", async () => {
  const source = await fixture(), invalid = Buffer.from("broken image");
  for (const options of [{ source: invalid }, { source, reference: invalid }, { source, owned: false }]) {
    const app = routeHost(options);
    assert.equal((await app.send()).status, options.owned === false ? 404 : 400);
    assert.equal(app.calls.charges, 0); assert.equal(app.calls.provider, 0);
  }
});

test("provider limits and outages return actionable errors with exactly one refund", async () => {
  const source = await fixture();
  for (const status of [429, 529, 401]) {
    const providerError = Object.assign(new Error("sensitive internal error"), { status, headers: new Headers({ "retry-after": "17" }) });
    const app = routeHost({ source, providerError });
    const result = await app.send();
    assert.equal(result.status, status === 429 ? 429 : status === 529 ? 503 : 502);
    assert.equal(app.calls.charges, 1); assert.equal(app.calls.refunds, 1);
    const body = await result.json();
    assert.equal(body.error.includes("sensitive"), false);
    if (status === 429) { assert.equal(result.headers.get("Retry-After"), "17"); assert.match(body.error, /17 seconds/); }
  }
});

test("malformed model edits refund once rather than applying invalid values", async () => {
  const source = await fixture();
  for (const reply of ["not json", "[]", '{"exposure":500}', '{"exposure":"bright"}']) {
    const app = routeHost({ source, reply });
    assert.equal((await app.send()).status, 502);
    assert.equal(app.calls.refunds, 1);
  }
});

test("Redux minute/hour limits explain the wait without billing", async () => {
  for (const [limit, wait] of [["minute", "60"], ["hour", "3600"]]) {
    const app = routeHost({ source: await fixture(), limit });
    const result = await app.send();
    assert.equal(result.status, 429); assert.equal(result.headers.get("Retry-After"), wait);
    assert.match((await result.json()).error, /Try again in up to 1/);
    assert.equal(app.calls.charges, 0); assert.equal(app.calls.provider, 0);
  }
});

test("chat Style Match dispatch uses prepared reference bytes and the same working route", async () => {
  const source = await fixture();
  const app = routeHost({ source });
  const adapters = Object.fromEntries(["ai/enhance", "ai/tone", "ai/color-balance", "ai/background-remove", "ai/generative-fill", "images/blur", "images/erase", "ai/heal"]
    .map((path) => [`@/app/api/${path}/route`, { POST: () => assert.fail("Wrong tool") }]));
  const { dispatchChatTool } = compile("../lib/chat-tool-dispatch.ts", {
    ...adapters, "@/app/api/ai/style-match/route": app.route, "@/lib/chat-image-context": app.context,
  });
  const response = await dispatchChatTool(new Request("https://redux.test/api/ai/chat/tools"), { type: "style_match" }, { imageId: "image-a", imageUrl }, "https://app.ufs.sh/f/reference");
  assert.equal(response.status, 200);
  assert.equal(app.calls.fetches.length, 2);
  assert.equal(app.calls.charges, 1);
});

test("browser references downscale before upload and release decoded images on success or failure", async () => {
  for (const fails of [false, true]) {
    let closed = 0, drawn;
    const canvas = { width: 0, height: 0,
      getContext: () => fails ? null : { fillRect() {}, drawImage: (_image, _x, _y, width, height) => { drawn = [width, height]; } },
      toDataURL: (type) => { assert.equal(type, "image/jpeg"); return "data:image/jpeg;base64,c21hbGw="; },
    };
    const { prepareVisionFile } = compile("../lib/prepare-vision-file.ts", {}, {
      createImageBitmap: async () => ({ width: 6000, height: 4000, close: () => { closed++; } }),
      document: { createElement: () => canvas },
    });
    if (fails) await assert.rejects(prepareVisionFile({}), /prepare the reference/);
    else { assert.equal((await prepareVisionFile({})).mediaType, "image/jpeg"); assert.deepEqual(drawn, [1000, 667]); }
    assert.equal(closed, 1);
  }
});
