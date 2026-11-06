import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { access, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { randomFillSync } from "node:crypto";
import vm from "node:vm";
import ts from "typescript";
import sharp from "sharp";
import { require as tsxRequire } from "tsx/cjs/api";

const nativeRequire = createRequire(import.meta.url);
const load = (path) => tsxRequire(path, import.meta.url);
const { DEFAULT_ADJUSTMENTS } = load("../constants/adjustments.ts");
const { extractStylePalette, transferStylePalette } = load("../lib/style-match-palette.ts");
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
test("a working PNG above the buffered limit can be analyzed from disk and is cleaned up", async () => {
  const source = await sharp({
    create: { width: 4400, height: 4400, channels: 3, background: "#839578" },
  }).png({ compressionLevel: 0 }).toBuffer();
  const { fetchTrustedMediaBuffer, withTrustedEditorImage, REMOTE_FETCH_LIMITS } = compile(
    "../lib/safe-remote-fetch.ts",
    { "@/lib/trusted-media-url": {
      ...load("../lib/trusted-media-url.ts"),
      assertHostnameResolvesToPublicAddresses: async () => {},
    } },
    {
      AbortController, setTimeout, clearTimeout,
      fetch: async () => {
        let offset = 0;
        return new Response(new ReadableStream({
          pull(controller) {
            if (offset >= source.length) return controller.close();
            const end = Math.min(offset + 64 * 1024, source.length);
            controller.enqueue(source.subarray(offset, end));
            offset = end;
          },
        }));
      },
    },
  );
  assert.ok(source.length > REMOTE_FETCH_LIMITS.MAX_BYTES);
  await assert.rejects(fetchTrustedMediaBuffer(imageUrl), { code: "TOO_LARGE" });

  const { fetchPreparedChatImage } = compile("../lib/chat-image-context.ts", {
    "@/lib/safe-remote-fetch": { withTrustedEditorImage },
  });
  await checkImage(await fetchPreparedChatImage(imageUrl));
  let stagedPath;
  await withTrustedEditorImage(imageUrl, async (path) => {
    stagedPath = path;
    assert.equal((await stat(path)).size, source.length);
    const native = await sharp(path).metadata();
    assert.equal(native.width, 4400);
    assert.equal(native.height, 4400);
  });
  await assert.rejects(access(stagedPath), { code: "ENOENT" });
});

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

function routeHost({ source, reference, providerError, reply, owned = true, limit, uploadError, persistError, insufficient } = {}) {
  const calls = { charges: 0, provider: 0, fetches: [], images: [], uploads: [], versions: [], deleted: [] };
  const context = compile("../lib/chat-image-context.ts", {
    "@/lib/safe-remote-fetch": { withTrustedEditorImage: async (url, processImage) => { calls.fetches.push(url); return processImage(source); } },
  });
  const route = compile("../app/api/ai/style-match/route.ts", {
    "@/lib/require-user": { requireAuthUser: async () => ({ user: { id: "user-a", creditBalance: 50 } }) },
    "@/lib/verify-user-image": { assertUserOwnsImageUrl: async () => owned ? { id: "image-a" } : null },
    "@/lib/kv": {
      checkRateLimitPerMinute: async () => ({ allowed: limit !== "minute" }),
      checkRateLimit: async () => ({ allowed: limit !== "hour" }), RATE_LIMIT_MINUTE: { style_match: 5 },
    },
    "@/lib/chat-image-context": context,
    "@/lib/safe-remote-fetch": { stageTrustedEditorImage: async (url) => { calls.fetches.push(url); return { path: source, cleanup: async () => {} }; } },
    "@/lib/cloudinary": {
      uploadToCloudinary: async (buffer, _filename, options) => {
        if (uploadError) throw uploadError;
        assert.equal(options?.preserveOriginal, true);
        calls.uploads.push(buffer);
        return { secureUrl: "https://app.ufs.sh/f/style-result", publicId: "style-result" };
      },
      deleteFromCloudinary: async (id) => { calls.deleted.push(id); },
    },
    "@/lib/prisma": { prisma: { imageVersion: { create: async ({ data }) => { if (persistError) throw persistError; calls.versions.push(data); } } } },
    "@/lib/atomic-credits": compile("../lib/atomic-credits.ts", {
      "@/lib/prisma": { prisma: { $transaction: async (operation) => {
        const result = await operation({
          user: { updateMany: async () => ({ count: insufficient ? 0 : 1 }), findUniqueOrThrow: async () => ({ creditBalance: 47 }) },
          creditTransaction: { create: async () => {} },
          imageVersion: { create: async ({ data }) => { if (persistError) throw persistError; calls.versions.push(data); } },
        });
        if (result.ok) calls.charges++;
        return result;
      } } },
      "@/lib/cloudinary": { deleteFromCloudinary: async (id) => { calls.deleted.push(id); } },
    }),
    "@/lib/anthropic": { anthropic: { messages: { create: async ({ messages }) => {
      calls.provider++;
      for (const block of messages[0].content.filter((item) => item.type === "image")) {
        await checkImage({ base64: block.source.data, mediaType: block.source.media_type });
      }
      calls.images.push(messages[0].content.filter((item) => item.type === "image").map((item) => item.source.data));
      if (providerError) throw providerError;
      const palettes = messages[0].content.find(item => item.type === "text").text.split("\n");
      const target = JSON.parse(palettes[0].slice("TARGET palette: ".length));
      const reference = JSON.parse(palettes[1].slice("REFERENCE palette: ".length));
      const defaultReply = JSON.stringify({ matches: target.map((swatch, i) => ({ target: swatch.id, reference: reference[Math.min(i, reference.length - 1)].id })) });
      return { content: [{ type: "text", text: reply ?? defaultReply }] };
    } } } },
  });
  const send = (target = imageUrl, referenceBytes = reference ?? source) => route.POST(new Request("https://redux.test/api/ai/style-match", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageUrl: target, referenceImageBase64: referenceBytes.toString("base64"), referenceImageMediaType: "image/jpeg" }),
  }));
  return { calls, send, route, context };
}

test("all storage providers normalize actual target bytes instead of trusting a JPEG label", async () => {
  const source = await fixture();
  for (const url of [imageUrl, "https://utfs.io/f/image", "https://res.cloudinary.com/demo/image/upload/v1/original.png"]) {
    const app = routeHost({ source });
    const response = await app.send(url);
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).adjustments, DEFAULT_ADJUSTMENTS);
    assert.equal(app.calls.charges, 1);
    assert.equal(app.calls.provider, 1);
  }
});

test("successful matches persist native pixels and return neutral sliders for an atomic source replacement", async () => {
  const source = await sharp({ create: { width: 1800, height: 1200, channels: 3, background: "#839578" } }).png().toBuffer();
  const app = routeHost({ source });
  const response = await app.send();
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.resultUrl, "https://app.ufs.sh/f/style-result");
  assert.deepEqual(result.adjustments, DEFAULT_ADJUSTMENTS);
  const metadata = await sharp(app.calls.uploads[0]).metadata();
  assert.equal(metadata.width, 1800); assert.equal(metadata.height, 1200);
  assert.equal(metadata.format, "png"); assert.ok(metadata.icc);
  assert.equal(app.calls.versions[0].imageId, "image-a");
  assert.equal(app.calls.versions[0].adjustments.operationResult, true);
  assert.equal(app.calls.charges, 1);
});

test("successive references send distinct reference pixels while keeping the target unchanged", async () => {
  const source = await fixture();
  const warm = await sharp({ create: { width: 50, height: 50, channels: 3, background: "#d9ac72" } }).png().toBuffer();
  const cool = await sharp({ create: { width: 50, height: 50, channels: 3, background: "#547ca0" } }).png().toBuffer();
  const app = routeHost({ source });
  await app.send(imageUrl, warm);
  await app.send(imageUrl, cool);
  assert.equal(app.calls.images.length, 2);
  assert.equal(app.calls.images[0][0], app.calls.images[1][0]);
  assert.notEqual(app.calls.images[0][0], app.calls.images[0][1]);
  assert.equal(app.calls.images[0][1], (await prepareChatVisionBase64(warm.toString("base64"))).base64);
  assert.equal(app.calls.images[1][1], (await prepareChatVisionBase64(cool.toString("base64"))).base64);
});

test("invalid target/reference images and missing ownership never charge or call Claude", async () => {
  const source = await fixture(), invalid = Buffer.from("broken image");
  for (const options of [{ source: invalid }, { source, reference: invalid }, { source, owned: false }]) {
    const app = routeHost(options);
    assert.equal((await app.send()).status, options.owned === false ? 404 : 400);
    assert.equal(app.calls.charges, 0); assert.equal(app.calls.provider, 0);
  }
});

test("provider limits and outages return actionable errors without charging", async () => {
  const source = await fixture();
  for (const status of [429, 529, 401]) {
    const providerError = Object.assign(new Error("sensitive internal error"), { status, headers: new Headers({ "retry-after": "17" }) });
    const app = routeHost({ source, providerError });
    const result = await app.send();
    assert.equal(result.status, status === 429 ? 429 : status === 529 ? 503 : 502);
    assert.equal(app.calls.charges, 0);
    const body = await result.json();
    assert.equal(body.error.includes("sensitive"), false);
    if (status === 429) { assert.equal(result.headers.get("Retry-After"), "17"); assert.match(body.error, /17 seconds/); }
  }
});

test("malformed model edits never charge", async () => {
  const source = await fixture();
  for (const reply of ["not json", "[]", "{}", '{"matches":[]}', '{"matches":[{"target":0,"reference":11}]}', '{"matches":[{"target":0,"reference":0},{"target":0,"reference":0}]}']) {
    const app = routeHost({ source, reply });
    assert.equal((await app.send()).status, 502);
    assert.equal(app.calls.charges, 0);
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
  assert.deepEqual((await response.json()).adjustments, DEFAULT_ADJUSTMENTS);
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

const colorDistance = (a, b) => Math.sqrt(a.reduce((sum, v, c) => sum + (v - b[c]) ** 2, 0));
async function scene(colors, texture = false) {
  const width = 192, height = 96, pixels = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const index = (y * width + x) * 4;
    const rgb = colors[Math.floor(x / 64)];
    const detail = texture ? (y % 2 ? 3 : -3) : 0;
    for (let c = 0; c < 3; c++) pixels[index + c] = rgb[c] + detail;
    pixels[index + 3] = x === 0 ? 0 : x === 1 ? 80 : 255;
  }
  return sharp(pixels, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

test("pixel transfer independently matches pale sky, rich greens and warm buildings without flattening texture", async () => {
  const targetColors = [[80, 130, 210], [125, 130, 75], [140, 145, 150]];
  const referenceColors = [[180, 200, 195], [30, 90, 45], [220, 200, 150]];
  const source = await scene(targetColors, true), reference = await scene(referenceColors);
  const targetPalette = await extractStylePalette(source), referencePalette = await extractStylePalette(reference);
  const nearest = (rgb, colors) => colors.map(color => colorDistance(rgb, color)).indexOf(Math.min(...colors.map(color => colorDistance(rgb, color))));
  const matches = targetPalette.map(swatch => ({ target: swatch.id,
    reference: nearest(referenceColors[nearest(swatch.rgb, targetColors)], referencePalette.map(s => s.rgb)) }));
  const result = await transferStylePalette(source, targetPalette, referencePalette, matches);
  const { data: before } = await sharp(source).raw().toBuffer({ resolveWithObject: true });
  const { data: after, info } = await sharp(result).raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, 192); assert.equal(info.height, 96);
  for (let i = 0; i < before.length; i += 4) assert.equal(after[i + 3], before[i + 3]);
  for (let region = 0; region < 3; region++) {
    const index = (40 * 192 + region * 64 + 32) * 4;
    const rgb = [...after.subarray(index, index + 3)];
    const oldError = colorDistance([...before.subarray(index, index + 3)], referenceColors[region]);
    assert.ok(colorDistance(rgb, referenceColors[region]) < oldError * 0.2, `Region ${region} must become substantially closer to its reference: ${rgb}`);
    const nextRow = index + 192 * 4;
    assert.ok(after[nextRow] > after[index], "Fine light/dark texture must remain at the same coordinates");
  }
  assert.ok(after[(40 * 192 + 96) * 4 + 1] > after[(40 * 192 + 96) * 4] * 2, "Grass must become rich green independently of the sky");
  const repeated = await transferStylePalette(source, targetPalette, referencePalette, matches);
  assert.deepEqual(repeated, result, "Matching must not introduce random grain or content");
});

test("changing only the reference changes actual output pixels, not just a success message", async () => {
  const source = await fixture();
  const app = routeHost({ source });
  const results = [];
  for (const color of ["#d9ac72", "#547ca0"]) {
    const reference = await sharp({ create: { width: 50, height: 50, channels: 3, background: color } }).png().toBuffer();
    assert.equal((await app.send(imageUrl, reference)).status, 200);
    const pixel = await sharp(app.calls.uploads.at(-1)).removeAlpha().raw().toBuffer();
    const expected = await sharp(reference).removeAlpha().raw().toBuffer();
    assert.ok(colorDistance([...pixel.subarray(0, 3)], [...expected.subarray(0, 3)]) < 4);
    results.push(pixel);
  }
  assert.notDeepEqual(results[0], results[1]);
});

test("storage and persistence failures do not charge and failed persistence cleans up the asset", async () => {
  for (const options of [{ uploadError: new Error("storage offline") }, { persistError: new Error("database offline") }]) {
    const app = routeHost({ source: await fixture(), ...options });
    assert.equal((await app.send()).status, 502);
    assert.equal(app.calls.charges, 0);
    assert.equal(app.calls.versions.length, 0);
    assert.equal(app.calls.deleted.length, options.persistError ? 1 : 0);
  }
});

test("a balance exhausted during generation discards the staged image without charging", async () => {
  const app = routeHost({ source: await fixture(), insufficient: true });
  assert.equal((await app.send()).status, 402);
  assert.equal(app.calls.provider, 1);
  assert.equal(app.calls.versions.length, 0);
  assert.equal(app.calls.charges, 0);
  assert.deepEqual(app.calls.deleted, ["style-result"]);
});

test("automatic adjustments charge only for a supported change to current settings", async () => {
  for (const name of ["enhance", "tone", "color-balance"]) {
    let charges = 0;
    let reply;
    const { POST } = compile(`../app/api/ai/${name}/route.ts`, {
      "@/lib/require-user": { requireAuthUser: async () => ({ user: { id: "user-a", creditBalance: 5 } }) },
      "@/lib/verify-user-image": { assertUserOwnsImageUrl: async () => ({ id: "photo-a" }) },
      "@/lib/kv": { checkRateLimit: async () => ({}), checkRateLimitPerMinute: async () => ({}), RATE_LIMIT_MINUTE: {} },
      "@/lib/expensive-route-guard": { rateLimitDeniedResponse: () => null },
      "@/lib/chat-image-context": { fetchPreparedChatImage: async () => ({ base64: "", mediaType: "image/jpeg" }) },
      "@/lib/anthropic": { anthropic: { messages: { create: async () => ({ content: [{ type: "text", text: reply }] }) } } },
      "@/lib/atomic-credits": { chargeCreditFeature: async () => { charges++; return { ok: true }; } },
    });
    const send = () => POST(new Request("https://redux.test/api", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageUrl, currentAdjustments: { saturation: 10 } }) }));
    for (reply of ["", "null", "{}", '{"constructor":12}', '{"saturation":10}', '{"saturation":101}', '{"saturation":"20"}']) {
      assert.equal((await send()).status, 422);
    }
    assert.equal(charges, 0);
    reply = '{"saturation":20}';
    assert.deepEqual(await (await send()).json(), { adjustments: { saturation: 20 } });
    assert.equal(charges, 1);
  }
});

test("the actual editor reload commits matched pixels and neutral sliders together and can undo both", async () => {
  const { normalizeAdjustments } = load("../constants/adjustments.ts");
  const { defaultPersistedEditorState, DEFAULT_IMAGE_TRANSFORM } = load("../lib/editor-state.ts");
  const { createEditorTimeline, appendEditorHistory } = load("../lib/editor-history.ts");
  const file = ts.createSourceFile("EditorApp.tsx", readFileSync(new URL("../components/editor/EditorApp.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let callback;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(file) === "reloadCanvas") callback = node.initializer.arguments[0].getText(file);
    ts.forEachChild(node, visit);
  }
  visit(file);
  assert.ok(callback);
  let state = defaultPersistedEditorState();
  state = { ...state, workingImageUrl: imageUrl, sliders: { ...state.sliders, grain: 60, temperature: -30 }, transform: { ...state.transform, rotation: 90 } };
  let timeline = appendEditorHistory(createEditorTimeline(), state, true, "Earlier edits");
  const original = structuredClone(state), commits = [], mod = { exports: {} };
  const code = ts.transpileModule(`module.exports = ${callback};`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(code, { module: mod, DEFAULT_IMAGE_TRANSFORM, normalizeAdjustments,
    probeImageDimensions: async () => ({ width: 1800, height: 1200 }), loadImageUrl: async () => true,
    commitState: (patch, checkpoint, label) => { commits.push(patch); state = { ...state, ...patch }; timeline = appendEditorHistory(timeline, state, checkpoint, label); },
  });
  const reload = mod.exports;
  assert.equal(await reload("https://app.ufs.sh/f/style-result", () => true, "Style Match", false, DEFAULT_ADJUSTMENTS), true);
  assert.equal(commits.length, 1);
  assert.deepEqual(state.sliders, DEFAULT_ADJUSTMENTS);
  assert.equal(state.workingWidth, 1800);
  assert.equal(state.transform.rotation, 90);
  assert.equal(state.workingImageUrl, "https://app.ufs.sh/f/style-result");
  assert.deepEqual(timeline.entries[timeline.cursor - 1].state, original, "One undo restores both the prior pixels and sliders");
  assert.equal(await reload("https://app.ufs.sh/f/stale", () => false, "Style Match", false, DEFAULT_ADJUSTMENTS), false);
  assert.equal(commits.length, 1, "A stale result must not create a partial edit");
});

test("the actual manual Style Match handler loads returned pixels and reset sliders through the shared reload", async () => {
  const { EDITOR_TOOL_ROUTES } = load("../lib/editor-tool-routes.ts");
  const file = ts.createSourceFile("AdjustmentPanel.tsx", readFileSync(new URL("../components/editor/AdjustmentPanel.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let handler;
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === "handleStyleMatchFilePick") handler = node.getText(file);
    ts.forEachChild(node, visit);
  }
  visit(file);
  assert.ok(handler);
  const mod = { exports: {} }, reloads = [], loading = [], success = [];
  let finished = 0;
  const code = ts.transpileModule(`${handler}\nmodule.exports = handleStyleMatchFilePick;`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(code, { module: mod, EDITOR_TOOL_ROUTES, appPath: load("../lib/app-path.ts").appPath, aiImageUrl: imageUrl, imageId: "image-a", console,
    createEditGuard: () => () => true, beginOperation: () => () => { finished++; },
    setLoadingStyleMatch: value => loading.push(value), setStyleMatchPreview() {},
    prepareVisionFile: async () => ({ dataUrl: "data:image/png;base64,YQ==", base64: "YQ==", mediaType: "image/png" }),
    prepareWorkingImage: async (_id, url) => url,
    fetch: async (url, init) => { assert.equal(url, EDITOR_TOOL_ROUTES.style_match); assert.equal(JSON.parse(init.body).imageUrl, imageUrl);
      return Response.json({ resultUrl: "https://app.ufs.sh/f/style-result", adjustments: DEFAULT_ADJUSTMENTS }); },
    onReloadCanvas: async (...args) => { reloads.push(args); return true; },
    onPatch: () => assert.fail("Baked pixels must not be applied as a slider-only patch"),
    toast: { success: message => success.push(message), error: message => assert.fail(message) },
  });
  await mod.exports({ target: { files: [{}], value: "reference.png" } });
  assert.equal(reloads.length, 1);
  assert.equal(reloads[0][0], "https://app.ufs.sh/f/style-result");
  assert.equal(reloads[0][3], false, "Retain the existing geometry");
  assert.deepEqual(reloads[0][4], DEFAULT_ADJUSTMENTS);
  assert.deepEqual(loading, [true, false]); assert.equal(finished, 1); assert.equal(success.length, 1);
});
