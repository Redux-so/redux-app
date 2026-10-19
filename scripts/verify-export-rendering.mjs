import assert from "node:assert/strict";
import { test } from "node:test";
import sharp from "sharp";
import { require as tsxRequire } from "tsx/cjs/api";
const { renderAdjustedImage } = tsxRequire("../lib/apply-image-adjustments.ts", import.meta.url);
const { createEditorOperations } = tsxRequire("../lib/editor-operations.ts", import.meta.url);
const { exportBodySchema } = tsxRequire("../lib/api-validation.ts", import.meta.url);
const { resolvePreviewSourceUrl } = tsxRequire("../lib/resolve-preview-source.ts", import.meta.url);
const { transformedDimensions } = tsxRequire("../lib/image-transform.ts", import.meta.url);

async function fixture() {
  const data = Buffer.alloc(48 * 32 * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = (i * 7) % 256; data[i + 1] = (i * 3) % 256; data[i + 2] = 130;
    data[i + 3] = i < 48 * 4 * 8 ? 0 : 190;
  }
  return sharp(data, { raw: { width: 48, height: 32, channels: 4 } }).png().toBuffer();
}
const adjustments = { exposure: 8, contrast: 20, temperature: 30, tint: -18, hue: 40, sharpen: 20, noiseReduction: -1, grain: 25, vignette: 40 };

test("the preview/export renderer is deterministic with all effects", async () => {
  const source = await fixture();
  const preview = await renderAdjustedImage(source, { adjustments, format: "png" });
  const exported = await renderAdjustedImage(source, { adjustments, format: "png" });
  assert.deepEqual(preview, exported);
  assert.notDeepEqual(await sharp(preview).raw().toBuffer(), await sharp(source).raw().toBuffer());
});

test("PNG and TIFF preserve alpha after all effects; JPEG explicitly mattes white", async () => {
  const source = await fixture();
  const alpha = await sharp(source).extractChannel("alpha").raw().toBuffer();
  for (const format of ["png", "tiff"]) {
    const result = await renderAdjustedImage(source, { adjustments, format });
    assert.deepEqual(await sharp(result).extractChannel("alpha").raw().toBuffer(), alpha);
    const meta = await sharp(result).metadata();
    assert.ok(meta.icc?.length); assert.equal(meta.space, "srgb");
  }
  const jpeg = await renderAdjustedImage(source, { adjustments, format: "jpeg", quality: 100 });
  const { data, info } = await sharp(jpeg).raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.channels, 3);
  assert.ok([...data.subarray(0, 3)].every((channel) => channel >= 250));
});

test("effects precede transforms and full rotated compositions are resized exactly", async () => {
  const source = await fixture();
  const transform = { rotation: 90, straighten: 0, flipX: true, flipY: true };
  const adjusted = await renderAdjustedImage(source, { adjustments, format: "png" });
  // Materialize flips before rotating, matching Fabric's image-local flips.
  const flipped = await sharp(adjusted).flip().flop().png().toBuffer();
  const expected = await sharp(flipped).rotate(90).raw().toBuffer();
  const result = await renderAdjustedImage(source, { adjustments, format: "png", transform });
  assert.deepEqual(await sharp(result).raw().toBuffer(), expected);
  const sized = await renderAdjustedImage(source, { adjustments, format: "png", transform, width: 80, height: 120 });
  const meta = await sharp(sized).metadata();
  assert.equal(meta.width, 80); assert.equal(meta.height, 120);
  const tilted = await renderAdjustedImage(source, { format: "png", transform: { ...transform, rotation: 0, straighten: 15 } });
  assert.equal((await sharp(tilted).raw().toBuffer())[3], 0);
});

test("EXIF orientation is baked once and all outputs carry an sRGB profile", async () => {
  const source = await sharp({ create: { width: 20, height: 10, channels: 3, background: "red" } })
    .withMetadata({ orientation: 6 }).withIccProfile("p3").jpeg().toBuffer();
  const result = await renderAdjustedImage(source, { format: "png" });
  const meta = await sharp(result).metadata();
  assert.equal(meta.width, 10); assert.equal(meta.height, 20);
  assert.ok(meta.icc?.length); assert.equal(meta.orientation, undefined);
  assert.deepEqual(transformedDimensions(20, 10, { rotation: 90, straighten: 0 }), { width: 10, height: 20 });
});

test("export waits for overlapping edits, including newly started operations", async () => {
  const operations = createEditorOperations();
  const first = operations.begin();
  let settled = false;
  const ready = operations.waitForIdle().then(() => { settled = true; });
  await Promise.resolve(); assert.equal(settled, false);
  const second = operations.begin(); first();
  await Promise.resolve(); assert.equal(settled, false);
  second(); await ready; assert.equal(settled, true);
});

test("export dimensions require a complete bounded pair", () => {
  assert.equal(exportBodySchema.safeParse({ imageId: "image-a", width: 800 }).success, false);
  assert.equal(exportBodySchema.safeParse({ imageId: "image-a", width: 800, height: 600 }).success, true);
  assert.equal(exportBodySchema.safeParse({ imageId: "image-a", width: 16000, height: 16000 }).success, false);
});


test("the document source wins over filename guesses and baked previews are not processed twice", () => {
  const originalUrl = "https://example.com/original.png";
  const replacement = "https://example.com/preview_reference_heal.png";
  assert.deepEqual(resolvePreviewSourceUrl({ originalUrl, imageUrl: replacement }), { kind: "url", url: replacement });
  assert.deepEqual(resolvePreviewSourceUrl({ originalUrl, imageUrl: replacement, storedPreviewUrl: replacement }), { kind: "url", url: originalUrl });
  assert.deepEqual(resolvePreviewSourceUrl({ originalUrl, imageUrl: "data:image/png;base64,YQ==" }), { kind: "base64", base64: "YQ==" });
});

test("a single flip occurs in image-local coordinates before rotation", async () => {
  const source = await fixture();
  const before = await sharp(source).flop().png().toBuffer();
  const expected = await sharp(before).rotate(90).raw().toBuffer();
  const actual = await renderAdjustedImage(source, { format: "png", transform: { rotation: 90, straighten: 0, flipX: true, flipY: false } });
  assert.deepEqual(await sharp(actual).raw().toBuffer(), expected);
});


test("lossless crops above the old 10 MiB limit are accepted within the upload ceiling", () => {
  const base64 = Buffer.alloc(11 * 1024 * 1024).toString("base64");
  assert.equal(exportBodySchema.safeParse({ imageId: "image-a", imageBase64: base64 }).success, true);
});


test("fast canvas PNG encoding preserves exported pixels at the same display size", async () => {
  const source = await fixture();
  const exported = await renderAdjustedImage(source, { adjustments, format: "png" });
  const preview = await renderAdjustedImage(source, { adjustments, format: "png", maxWidth: 24, pngCompressionLevel: 1 });
  const expected = await sharp(exported).resize(24, null, { fit: "inside", withoutEnlargement: true }).raw().toBuffer();
  assert.deepEqual(await sharp(preview).raw().toBuffer(), expected);
});


test("already rendered canvas pixels survive encoding without reapplying adjustments", async () => {
  const source = await fixture();
  for (const format of ["png", "tiff"]) {
    const encoded = await renderAdjustedImage(source, { pixelsRendered: true, adjustments, format });
    assert.deepEqual(await sharp(encoded).raw().toBuffer(), await sharp(source).raw().toBuffer());
    assert.ok((await sharp(encoded).metadata()).icc?.length);
  }
  const rotated = await renderAdjustedImage(source, { pixelsRendered: true, adjustments, format: "png",
    transform: { rotation: 90, straighten: 0, flipX: false, flipY: false } });
  assert.deepEqual(await sharp(rotated).raw().toBuffer(), await sharp(source).rotate(90).raw().toBuffer());
});
