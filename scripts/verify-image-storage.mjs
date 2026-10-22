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
const { prepareStorageImage, CLOUDINARY_IMAGE_MAX_BYTES, ImageStorageError, imageStorageErrorBody, alternateAssetIdFromUrl } = load("../lib/image-storage.ts");

async function sample() {
  const rgba = Buffer.alloc(320 * 240 * 4);
  for (let i = 0; i < 320 * 240; i++) {
    rgba[i * 4] = i % 256; rgba[i * 4 + 1] = Math.floor(i / 320) % 256;
    rgba[i * 4 + 2] = Math.floor(i / 200) % 256; rgba[i * 4 + 3] = i % 3 ? 255 : 90;
  }
  return { rgba, png: await sharp(rgba, { raw: { width: 320, height: 240, channels: 4 } }).png({ compressionLevel: 0 }).toBuffer() };
}

test("oversized working PNGs shrink losslessly without changing dimensions or transparency", async () => {
  const { rgba, png } = await sample();
  const result = await prepareStorageImage(png, 90_000);
  assert.ok(result.length <= 90_000);
  const { data, info } = await sharp(result).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, 320); assert.equal(info.height, 240);
  assert.deepEqual(data, rgba);
});

test("lossless WebP is used when PNG cannot fit; pixels and alpha stay unchanged", async () => {
  const { rgba, png } = await sample();
  const webp = await sharp(png).keepMetadata().webp({ lossless: true, effort: 6 }).toBuffer();
  const optimizedPng = await sharp(png).keepMetadata().png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
  assert.ok(webp.length < optimizedPng.length);
  const result = await prepareStorageImage(png, webp.length);
  assert.equal((await sharp(result).metadata()).format, "webp");
  assert.deepEqual(await sharp(result).ensureAlpha().raw().toBuffer(), rgba);
});

test("small assets stay byte-identical; incompressible images stay full-size for alternate storage", async () => {
  const { png, rgba } = await sample();
  assert.equal(await prepareStorageImage(png), png);
  const result = await prepareStorageImage(png, 1);
  assert.ok(result.length > 1);
  assert.deepEqual(await sharp(result).ensureAlpha().raw().toBuffer(), rgba);
});

function storageHost({ token = true, providerSizeError = false, uploadFails = false } = {}) {
  const state = { primary: [], alternate: [], deleted: [] };
  const cloudinary = { config() {}, uploader: {
    upload_stream(options, callback) { return { end(buffer) {
      state.primary.push({ options, buffer });
      if (providerSizeError) callback({ message: "File size too large. Maximum is 1048576.", http_code: 400 });
      else callback(undefined, { secure_url: "https://res.cloudinary.com/test/image/upload/result.png", public_id: options.public_id, width: 320, height: 240, format: "png" });
    } }; }, destroy: async (id) => state.deleted.push(id),
  } };
  const adapters = {
    sharp: { default: sharp },
    cloudinary: { v2: cloudinary },
    "uploadthing/server": {
      UTFile: class extends Blob { constructor(parts, name, options) { super(parts, options); this.name = name; } },
      UTApi: class {
        async uploadFiles(file) {
          state.alternate.push(Buffer.from(await file.arrayBuffer()));
          return uploadFails ? { error: { message: "storage offline" } } : { data: { key: "large-image-key", ufsUrl: "https://test.ufs.sh/f/large-image-key" } };
        }
        async deleteFiles(key) { state.deleted.push(key); return { success: true }; }
      },
    },
  };
  const code = ts.transpileModule(readFileSync(new URL("../lib/cloudinary.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(code, { module: mod, exports: mod.exports, Buffer, Uint8Array, process: { env: token ? { UPLOADTHING_TOKEN: "test-only" } : {} },
    require: (id) => adapters[id] ?? (id.startsWith("@/") ? load(`../${id.slice(2)}`) : nativeRequire(id)) });
  return { ...mod.exports, state };
}

test("large original uploads retain exact bytes and get immutable alternate asset IDs with cleanup", async () => {
  const { png } = await sample();
  const original = Buffer.concat([png, Buffer.alloc(CLOUDINARY_IMAGE_MAX_BYTES)]);
  const app = storageHost();
  const uploaded = await app.uploadToCloudinary(original, "original.png", { preserveOriginal: true });
  assert.equal(app.state.primary.length, 0);
  assert.equal(uploaded.width, 320); assert.equal(uploaded.height, 240);
  assert.equal(uploaded.publicId, "uploadthing:large-image-key");
  assert.deepEqual(app.state.alternate[0], original);
  await app.deleteFromCloudinary(uploaded.publicId);
  assert.deepEqual(app.state.deleted, ["large-image-key"]);
});

test("provider-specific size rejections fall back once without changing the pixels", async () => {
  const { png } = await sample();
  const app = storageHost({ providerSizeError: true });
  await app.uploadToCloudinary(png, "result.png");
  assert.equal(app.state.primary.length, 1); assert.equal(app.state.alternate.length, 1);
  assert.deepEqual(app.state.alternate[0], png);
});

test("missing alternate storage produces a permanent clear error; transient failures stay retryable", async () => {
  const { png } = await sample();
  for (const [options, retryable] of [[{ token: false, providerSizeError: true }, false], [{ providerSizeError: true, uploadFails: true }, true]]) {
    const app = storageHost(options);
    await assert.rejects(() => app.uploadToCloudinary(png, "result.png"), (error) => {
      assert.ok(error instanceof ImageStorageError);
      assert.equal(imageStorageErrorBody(error).retryable, retryable);
      return true;
    });
    assert.equal(app.state.primary.length, 1);
  }
});

test("alternate delivery URLs can be collected for deletion without accepting unrelated hosts", () => {
  assert.equal(alternateAssetIdFromUrl("https://app.ufs.sh/f/key-123"), "uploadthing:key-123");
  assert.equal(alternateAssetIdFromUrl("https://utfs.io/f/key-123?x=y"), "uploadthing:key-123");
  assert.equal(alternateAssetIdFromUrl("https://evil.example/f/key-123"), null);
});
