/**
 * PERF-02 multipart upload parsing — no HTTP required.
 * Run: pnpm exec tsx scripts/verify-image-upload.ts
 */
import assert from "node:assert/strict";
import {
  IMAGE_UPLOAD_MAX_BYTES,
  parseImageUploadFormData,
} from "../lib/image-upload";

async function formWithFile(
  bytes: Buffer,
  opts: { name?: string; type?: string } = {},
): Promise<FormData> {
  const form = new FormData();
  const blob = new Blob([Uint8Array.from(bytes)], { type: opts.type ?? "image/jpeg" });
  const file = new File([blob], opts.name ?? "photo.jpg", { type: opts.type ?? "image/jpeg" });
  form.set("file", file);
  return form;
}

async function main() {
  const tinyJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);

  const ok = await parseImageUploadFormData(await formWithFile(tinyJpeg));
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.name, "photo.jpg");
    assert.equal(ok.size, tinyJpeg.length);
  }

  const missing = await parseImageUploadFormData(new FormData());
  assert.equal(missing.ok, false);

  const badType = await parseImageUploadFormData(
    await formWithFile(tinyJpeg, { type: "image/bmp" }),
  );
  assert.equal(badType.ok, false);

  const tooLarge = await parseImageUploadFormData(
    await formWithFile(Buffer.alloc(IMAGE_UPLOAD_MAX_BYTES + 1)),
  );
  assert.equal(tooLarge.ok, false);

  console.log("verify-image-upload: ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
