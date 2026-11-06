import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import sharp from "sharp";
import { require as tsxRequire } from "tsx/cjs/api";

const nativeRequire = createRequire(import.meta.url);
const load = (path) => tsxRequire(path, import.meta.url);
const retouch = load("../lib/retouch-image.ts");
const { util, Path, Rect } = nativeRequire("fabric");
function compile(path, adapters = {}, globals = {}) {
  const mod = { exports: {} };
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, { module: mod, exports: mod.exports, Buffer, Request, Response, URL,
    process: { env: {} }, console, ...globals,
    require: (id) => adapters[id] ?? (id.startsWith("@/") ? load(`../${id.slice(2)}`) : nativeRequire(id)),
  });
  return mod.exports;
}

async function fixture(width = 160, height = 100) {
  const pixels = Buffer.alloc(width * height * 4), mask = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    pixels[i] = x * 17 % 256; pixels[i + 1] = y * 23 % 256; pixels[i + 2] = (x + y) * 13 % 256;
    pixels[i + 3] = x < 5 ? 0 : x < 10 ? 120 : 255;
    mask[i + 3] = 255;
    if ((x >= 30 && x < 40 && y >= 20 && y < 25) || (x === 48 && y === 27)) {
      mask[i] = mask[i + 1] = mask[i + 2] = x === 30 ? 128 : 255;
    }
  }
  const source = await sharp(pixels, { raw: { width, height, channels: 4 } }).png().toBuffer();
  const maskBase64 = (await sharp(mask, { raw: { width, height, channels: 4 } }).png().toBuffer()).toString("base64");
  return { source, maskBase64, image: await retouch.prepareRetouchImage(source, maskBase64) };
}
async function assertLocalized(image, result) {
  const { data, info } = await sharp(result).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, image.width); assert.equal(info.height, image.height);
  let changed = 0;
  for (let i = 0; i < image.mask.length; i++) {
    assert.equal(data[i * 4 + 3], image.pixels[i * 4 + 3], "retouch must preserve alpha");
    if (image.mask[i] === 0 || image.pixels[i * 4 + 3] === 0) {
      assert.deepEqual(data.subarray(i * 4, i * 4 + 4), image.pixels.subarray(i * 4, i * 4 + 4), `unselected pixel ${i}`);
    } else if (!data.subarray(i * 4, i * 4 + 3).equals(image.pixels.subarray(i * 4, i * 4 + 3))) changed++;
  }
  assert.ok(changed > 0, "selected pixels must actually change");
}

test("RGBA masks decode to one channel with exact disconnected stroke bounds", async () => {
  const { image } = await fixture();
  assert.equal(image.mask.length, image.width * image.height);
  assert.deepEqual(image.selection, { left: 30, top: 20, width: 19, height: 8 });
  assert.equal(image.mask[20 * image.width + 30], 128);
});

test("blank, malformed and mismatched masks fail instead of editing the entire photo", async () => {
  const { source } = await fixture();
  for (const mask of ["invalid", (await sharp({ create: { width: 160, height: 100, channels: 4, background: "black" } }).png().toBuffer()).toString("base64"),
    (await sharp({ create: { width: 80, height: 50, channels: 3, background: "white" } }).png().toBuffer()).toString("base64")]) {
    await assert.rejects(retouch.prepareRetouchImage(source, mask), retouch.RetouchMaskError);
  }
});

test("blur changes only painted pixels, including soft mask edges and transparent sources", async () => {
  const { image } = await fixture();
  const blurred = await sharp(image.pixels, { raw: { width: image.width, height: image.height, channels: 4 } }).blur(8).png().toBuffer();
  await assertLocalized(image, await retouch.compositeRetouch(image, blurred));
});

test("even a completely altered AI result cannot change unpainted pixels", async () => {
  const { image } = await fixture();
  const replacement = await sharp({ create: { width: image.width, height: image.height, channels: 4, background: "magenta" } }).png().toBuffer();
  await assertLocalized(image, await retouch.compositeRetouch(image, replacement));
});

test("inpainting pairs use the same padded, aspect-preserving crop and restore native dimensions", async () => {
  const { image } = await fixture(1800, 200);
  const crop = await retouch.prepareInpaintCrop(image);
  assert.ok(crop.region.width < image.width);
  for (const input of [crop.source, crop.mask]) {
    const metadata = await sharp(input).metadata();
    assert.equal(metadata.width, crop.paddedWidth); assert.equal(metadata.height, crop.paddedHeight);
    assert.equal(metadata.width % 64, 0); assert.equal(metadata.height % 64, 0);
  }
  const output = await sharp({ create: { width: crop.paddedWidth, height: crop.paddedHeight, channels: 3, background: "red" } }).png().toBuffer();
  await assertLocalized(image, await retouch.restoreInpaintCrop(image, crop, output));
  await assert.rejects(retouch.restoreInpaintCrop(image, crop, await sharp(output).resize(32, 32).png().toBuffer()), /incorrectly sized/);
});

test("downscaling a large selection never drops isolated one-pixel strokes", async () => {
  const { image } = await fixture(1800, 1200);
  image.mask[1100 * image.width + 1700] = 255;
  image.selection = { left: 30, top: 20, width: 1671, height: 1081 };
  const crop = await retouch.prepareInpaintCrop(image);
  const mask = await sharp(crop.mask).greyscale().raw().toBuffer();
  assert.equal(mask[Math.floor(1100 * crop.height / crop.region.height) * crop.paddedWidth + Math.floor(1700 * crop.width / crop.region.width)], 255);
});

test("EXIF orientation is normalized once before aligning masks", async () => {
  const source = await sharp({ create: { width: 40, height: 20, channels: 3, background: "red" } })
    .withMetadata({ orientation: 6 }).jpeg().toBuffer();
  const mask = await sharp({ create: { width: 20, height: 40, channels: 3, background: "white" } }).png().toBuffer();
  const result = await retouch.prepareRetouchImage(source, mask.toString("base64"));
  assert.equal(result.width, 20); assert.equal(result.height, 40);
});

test("background removal uses only the provider alpha and retains source RGB and existing transparency", async () => {
  const { source, image } = await fixture();
  const output = await sharp({ create: { width: image.width, height: image.height, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 0.5 } } }).png().toBuffer();
  const result = await sharp(await retouch.applyBackgroundMatte(source, output)).raw().toBuffer();
  for (let i = 0; i < image.pixels.length; i += 4) {
    assert.deepEqual(result.subarray(i, i + 3), image.pixels.subarray(i, i + 3));
    assert.equal(result[i + 3], Math.round(image.pixels[i + 3] * 128 / 255));
  }
  const unaligned = await sharp(output).resize(10, 10).png().toBuffer();
  await assert.rejects(retouch.applyBackgroundMatte(source, unaligned), /aligned transparency/);
  const opaque = await sharp(output).removeAlpha().png().toBuffer();
  await assert.rejects(retouch.applyBackgroundMatte(source, opaque), /aligned transparency/);
});

test("inpainting sends matching source and mask crops and composites the returned result", async () => {
  const { image } = await fixture();
  const uploads = [];
  let sent;
  const { inpaintSelection } = compile("../lib/retouch-inpaint.ts", {
    replicate: class { async run(model, options) { assert.match(model, /remove-object:/); sent = options.input; return { url: () => new URL("https://replicate.delivery/result.png") }; } },
    "@/lib/cloudinary": { uploadToCloudinary: async (buffer, filename) => {
      uploads.push({ buffer, filename }); return { secureUrl: `https://example.com/${filename}` };
    } },
    "@/lib/safe-remote-fetch": { fetchReplicateDeliveryBuffer: async () => {
      const { width, height } = await sharp(uploads[0].buffer).metadata();
      return { buffer: await sharp({ create: { width, height, channels: 3, background: "yellow" } }).png().toBuffer() };
    } },
  });
  await assertLocalized(image, await inpaintSelection(image, "image-a", "heal"));
  assert.equal(uploads.length, 2);
  assert.match(sent.image, /heal_input/); assert.match(sent.mask, /heal_mask/);
  const first = await sharp(uploads[0].buffer).metadata(), second = await sharp(uploads[1].buffer).metadata();
  assert.equal(first.width, second.width); assert.equal(first.height, second.height);
});

test("local crop sources are registered before retouch; upload failures stop the request", async () => {
  const { prepareWorkingImage } = load("../lib/prepare-working-image.ts");
  const originalFetch = globalThis.fetch;
  let calls = 0, fail = false;
  globalThis.fetch = async (_url, options) => {
    calls++;
    const payload = JSON.parse(options.body);
    assert.equal(payload.sourceOnly, true); assert.equal(payload.imageBase64, "cGl4ZWxz");
    return Response.json({ sourceUrl: "https://example.com/owned-crop.png" }, { status: fail ? 500 : 200 });
  };
  try {
    assert.equal(await prepareWorkingImage("image-a", "https://example.com/photo.png"), "https://example.com/photo.png");
    assert.equal(calls, 0);
    assert.equal(await prepareWorkingImage("image-a", "data:image/png;base64,cGl4ZWxz"), "https://example.com/owned-crop.png");
    fail = true;
    await assert.rejects(prepareWorkingImage("image-a", "data:image/png;base64,cGl4ZWxz"), /No tool was run/);
  } finally { globalThis.fetch = originalFetch; }
});

test("the canvas relayout handler keeps all three brush selections anchored to the image", () => {
  const { maskImageFrame } = load("../lib/canvas-retouch-mask.ts");
  const source = readFileSync(new URL("../hooks/useCanvas.ts", import.meta.url), "utf8");
  const callback = source.slice(source.indexOf("  const relayoutCanvas = useCallback("), source.indexOf("  // Apply the current transform ref values"));
  const code = ts.transpileModule(callback + "\nrelayoutCanvas();", { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const img = new Rect({ width: 500, height: 250, originX: "center", originY: "center", left: 400, top: 300, scaleX: 0.8, scaleY: 0.8 });
  const paths = [0, 1, 2].map((offset) => new Path(`M ${200 + offset} 200 L 250 230`, { stroke: "white", strokeWidth: 12 }));
  const locals = paths.map((path) => util.multiplyTransformMatrices(util.invertTransform(maskImageFrame(img)), path.calcTransformMatrix()));
  const frames = new WeakMap(paths.map((path, index) => [path, locals[index]]));
  const bounds = img.getBoundingRect();
  const noop = () => {};
  const canvas = { viewportTransform: [1.8, 0, 0, 1.8, 40, -20], getWidth: () => 800, getHeight: () => 600,
    setDimensions: noop, setViewportTransform: noop, renderAll: noop };
  vm.runInNewContext(code, {
    useCallback: (callback) => callback, fabricRef: { current: canvas }, containerRef: { current: {} }, bgImageRef: { current: img },
    layoutRef: { current: { width: 800, height: 600, bounds } }, showBeforeRef: { current: false }, displayedBounds: () => img.getBoundingRect(),
    canvasViewportSize: () => ({ width: 350, height: 250 }), transformRef: { current: { rotation: 90, straighten: 13, flipX: true, flipY: false } },
    transformedDimensions: load("../lib/image-transform.ts").transformedDimensions, transformUtilsRef: { current: util }, maskImageFrame,
    maskFramesRef: { current: frames }, healPathsRef: { current: [paths[0]] }, eraserPathsRef: { current: [paths[1]] }, blurPathsRef: { current: [paths[2]] },
    syncViewport: noop, updateImageBounds: noop,
  });
  paths.forEach((path, index) => {
    const actual = util.multiplyTransformMatrices(util.invertTransform(maskImageFrame(img)), path.calcTransformMatrix());
    actual.forEach((value, component) => assert.ok(Math.abs(value - locals[index][component]) < 1e-8));
  });
});

test("real brush paths map into source pixels through rotation, flips, zoom-independent frames and resize", async () => {
  for (const [angle, flipX, flipY] of [[0, false, false], [90, true, false], [17, false, true], [-90, true, true]]) {
    const radians = angle * Math.PI / 180;
    const matrix = [Math.cos(radians) * 0.4 * (flipX ? -1 : 1), Math.sin(radians) * 0.4 * (flipX ? -1 : 1),
      -Math.sin(radians) * 0.4 * (flipY ? -1 : 1), Math.cos(radians) * 0.4 * (flipY ? -1 : 1), 280, 180];
    const image = { width: 500, height: 250, calcTransformMatrix: () => matrix };
    let rendered;
    class StaticCanvas {
      constructor(_element, options) { assert.equal(options.enableRetinaScaling, false); }
      add(path) { rendered = path; }
      renderAll() {}
      toDataURL() { return "data:image/png;base64,bWFzaw=="; }
      async dispose() {}
    }
    const { maskImageFrame, exportSourceMask } = compile("../lib/canvas-retouch-mask.ts", {
      fabric: { StaticCanvas, util },
    }, { document: { createElement: () => ({}) } });
    const sourceStroke = new Path("M 100 50 L 140 60", { stroke: "white", strokeWidth: 10, fill: null });
    const expected = [...sourceStroke.calcTransformMatrix()];
    const scene = util.multiplyTransformMatrices(maskImageFrame(image), [1 / 1000, 0, 0, 1 / 500, -0.5, -0.5]);
    util.applyTransformToObject(sourceStroke, util.multiplyTransformMatrices(scene, sourceStroke.calcTransformMatrix()));
    await exportSourceMask(image, [sourceStroke], 1000, 500);
    rendered.calcTransformMatrix().forEach((value, index) => assert.ok(Math.abs(value - expected[index]) < 1e-8));
    assert.equal(rendered.strokeWidth, 10);
    assert.equal(sourceStroke.strokeWidth, 10);
  }
});

for (const [tool, path] of [["blur", "../app/api/images/blur/route.ts"], ["erase", "../app/api/images/erase/route.ts"], ["heal", "../app/api/ai/heal/route.ts"]]) {
  test(`${tool} route stores only the masked result and bills only successful edits`, async () => {
    const { source, maskBase64, image } = await fixture();
    let stored, versions = 0, charges = 0;
    const { POST } = compile(path, {
      "@/lib/require-user": { requireAuthUser: async () => ({ user: { id: "user-a", creditBalance: 100 } }) },
      "@/lib/prisma": { prisma: { image: { findFirst: async () => ({ filename: "photo.png" }) }, imageVersion: { create: async () => { versions++; } } } },
      "@/lib/expensive-route-guard": { enforceFeatureRateLimits: async () => null, rateLimitDeniedResponse: () => null },
      "@/lib/kv": { checkRateLimit: async () => ({}), checkRateLimitPerMinute: async () => ({}), RATE_LIMIT_MINUTE: { heal: 10 } },
      "@/lib/atomic-credits": { commitPaidImageVersion: async () => { versions++; charges++; return { ok: true }; } },
      "@/lib/safe-remote-fetch": { withTrustedEditorImage: async (_url, processImage) => processImage(source) },
      "@/lib/retouch-inpaint": { inpaintSelection: async (selected) => {
        const crop = await retouch.prepareInpaintCrop(selected);
        const output = await sharp({ create: { width: crop.paddedWidth, height: crop.paddedHeight, channels: 3, background: "magenta" } }).png().toBuffer();
        return retouch.restoreInpaintCrop(selected, crop, output);
      } },
      "@/lib/cloudinary": { uploadToCloudinary: async (buffer) => { stored = buffer; return { secureUrl: "https://example.com/edited.png", publicId: "edited" }; } },
    });
    const request = (mask) => new Request("https://example.com/api", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageUrl: "https://res.cloudinary.com/demo/image/upload/photo.png", imageId: "image-a", maskBase64: mask, blurIntensity: 40 }) });
    assert.equal((await POST(request(maskBase64))).status, 200);
    await assertLocalized(image, stored);
    const invalid = (await sharp({ create: { width: 8, height: 8, channels: 3, background: "white" } }).png().toBuffer()).toString("base64");
    assert.equal((await POST(request(invalid))).status, 400);
    assert.equal(versions, 1);
    assert.equal(charges, tool === "blur" ? 0 : 1);
  });
}
