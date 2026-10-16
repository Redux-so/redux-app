/**
 * SEC-04 media ownership helpers — no auth, HTTP, or UploadThing API required.
 * Run: pnpm exec tsx scripts/verify-media-ownership.ts
 */
import assert from "node:assert/strict";
import { patchImageBodySchema, parseRequestBody } from "../lib/api-validation";
import { cloudinaryPublicIdFromDeliveryUrl } from "../lib/cloudinary-public-id";
import {
  isUploadThingCustomIdForUser,
  normalizeMediaUrlForCompare,
  parseUploadThingFileKeyFromTrustedUrl,
} from "../lib/uploadthing-ownership";

function expectFail(schema: Parameters<typeof parseRequestBody>[0], raw: unknown) {
  const result = parseRequestBody(schema, raw);
  assert.equal(result.ok, false, `Expected validation failure for ${JSON.stringify(raw)}`);
}

function expectOk<T>(schema: Parameters<typeof parseRequestBody<T>>[0], raw: unknown) {
  const result = parseRequestBody(schema, raw);
  assert.equal(result.ok, true, `Expected validation success for ${JSON.stringify(raw)}`);
}

const userId = "user_abc123";

assert.equal(
  parseUploadThingFileKeyFromTrustedUrl("https://utfs.io/f/my-upload-key"),
  "my-upload-key",
);

assert.equal(
  parseUploadThingFileKeyFromTrustedUrl("https://example.com/evil.jpg"),
  null,
);

assert.equal(isUploadThingCustomIdForUser(`${userId}:uuid`, userId), true);
assert.equal(isUploadThingCustomIdForUser(userId, userId), true);
assert.equal(isUploadThingCustomIdForUser("other_user:uuid", userId), false);
assert.equal(isUploadThingCustomIdForUser(null, userId), false);

assert.equal(
  normalizeMediaUrlForCompare("https://utfs.io/f/x?foo=1"),
  "https://utfs.io/f/x",
);

const previewUrl =
  "https://res.cloudinary.com/demo/image/upload/w_400,h_400/v1234567890/redux/preview_photo.jpeg";
assert.equal(
  cloudinaryPublicIdFromDeliveryUrl(previewUrl),
  "redux/preview_photo",
);

const originalUrl =
  "https://res.cloudinary.com/demo/image/upload/v1234567890/redux/sample.jpg";
assert.equal(
  cloudinaryPublicIdFromDeliveryUrl(originalUrl),
  "redux/sample",
);

expectOk(patchImageBodySchema, { isFavorite: true });
expectOk(patchImageBodySchema, { restore: true });
expectFail(patchImageBodySchema, { previewUrl: "https://evil.example/p.jpg" });
expectFail(patchImageBodySchema, {});

console.log("verify-media-ownership: all checks passed");
