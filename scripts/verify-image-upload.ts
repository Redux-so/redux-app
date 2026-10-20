/**
 * PERF-02 multipart upload parsing — no HTTP required.
 * Run: pnpm exec tsx scripts/verify-image-upload.ts
 */
import assert from "node:assert/strict";
import { runUploadBatch, validateUploadFiles } from "../lib/image-upload-batch";
import { IMAGE_UPLOAD_BATCH_LIMIT, IMAGE_UPLOAD_CONCURRENCY } from "../constants/image-upload";
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

  const files = Array.from({ length: IMAGE_UPLOAD_BATCH_LIMIT }, (_, index) =>
    new File([tinyJpeg], `photo-${index}.jpg`, { type: "image/jpeg" }),
  );
  const invalid = new File([tinyJpeg], "document.txt", { type: "text/plain" });
  const empty = new File([], "empty.png", { type: "image/png" });
  const oversized = new File([new Uint8Array(IMAGE_UPLOAD_MAX_BYTES + 1)], "large.png", { type: "image/png" });
  const validation = validateUploadFiles([...files, invalid, empty, oversized]);
  assert.equal(validation.accepted.length, IMAGE_UPLOAD_BATCH_LIMIT);
  assert.equal(validation.rejected.length, 3);
  assert.ok(validation.rejected.every((failure) => !failure.retryable));

  let active = 0;
  let peak = 0;
  const attempted = new Set<number>();
  const settled = new Set<number>();
  const failed: File[] = [];
  await runUploadBatch(files, async (_file, index) => {
    active++;
    peak = Math.max(peak, active);
    attempted.add(index);
    await new Promise((resolve) => setTimeout(resolve, index % 3));
    active--;
    if (index === 1 || index === 7) throw new Error("Simulated upload failure");
  }, (file, index, error) => {
    assert.ok(!settled.has(index), "Each photo settles once");
    settled.add(index);
    if (error) failed.push(file);
  });
  assert.equal(peak, IMAGE_UPLOAD_CONCURRENCY);
  assert.equal(attempted.size, files.length, "Failures must not interrupt the batch");
  assert.equal(settled.size, files.length);
  assert.equal(failed.length, 2);

  const retried: File[] = [];
  await runUploadBatch(failed, async (file) => { retried.push(file); }, () => {});
  assert.deepEqual(retried, failed, "Retry must only upload failed photos");
  await runUploadBatch([], async () => { assert.fail("Empty batches do not upload"); }, () => {});

  console.log("verify-image-upload: ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
