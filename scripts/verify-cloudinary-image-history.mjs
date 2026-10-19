/** New edits must have immutable asset identities; intentional replacements stay stable. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { require as tsxRequire } from "tsx/cjs/api";
const { cloudinary, uploadToCloudinary } = tsxRequire("../lib/cloudinary.ts", import.meta.url);

test("repeated image operations upload distinct pixels without overwriting undo sources", async () => {
  const originalUpload = cloudinary.uploader.upload_stream;
  const assets = new Map();
  cloudinary.uploader.upload_stream = (options, callback) => ({
    end(buffer) {
      if (!assets.has(options.public_id) || options.overwrite) assets.set(options.public_id, buffer.toString());
      callback(undefined, {
        secure_url: `https://example.com/${options.public_id}.png`, public_id: options.public_id,
        width: 10, height: 10, format: "png",
      });
    },
  });
  try {
    const first = await uploadToCloudinary(Buffer.from("first mask result"), "photo_blur.jpeg");
    const second = await uploadToCloudinary(Buffer.from("second mask result"), "photo_blur.jpeg");
    assert.notEqual(first.secureUrl, second.secureUrl);
    assert.equal(assets.get(first.publicId), "first mask result");
    assert.equal(assets.get(second.publicId), "second mask result");
    const options = { overwrite: true, uniqueFilename: false };
    const saved = await uploadToCloudinary(Buffer.from("first save"), "working.png", options);
    const updated = await uploadToCloudinary(Buffer.from("latest save"), "working.png", options);
    assert.equal(saved.publicId, "working");
    assert.equal(updated.publicId, saved.publicId);
    assert.equal(assets.get(updated.publicId), "latest save");
  } finally { cloudinary.uploader.upload_stream = originalUpload; }
});
