/**
 * SEC-01 manual QA for trusted URL validation and safe fetch guards.
 * Run: pnpm exec tsx scripts/verify-ssrf-guards.ts
 */
import assert from "node:assert/strict";
import {
  UntrustedUrlError,
  hostnameMatchesPattern,
  isTrustedMediaHttpUrl,
  validateReplicateDeliveryUrl,
  validateTrustedMediaUrl,
} from "../lib/trusted-media-url";
import { REMOTE_FETCH_LIMITS } from "../lib/safe-remote-fetch";

assert.equal(
  hostnameMatchesPattern("abc123.ufs.sh", "*.ufs.sh"),
  true,
  "wildcard ufs.sh",
);
assert.equal(
  hostnameMatchesPattern("utfs.io", "*.ufs.sh"),
  false,
  "utfs.io is not a ufs.sh subdomain",
);

const cloudinary =
  "https://res.cloudinary.com/demo/image/upload/sample.jpg";
const uploadthing = "https://utfs.io/f/abc123";
const ufs = "https://my-file.ufs.sh/f/abc";

assert.equal(isTrustedMediaHttpUrl(cloudinary), true);
assert.equal(isTrustedMediaHttpUrl(uploadthing), true);
assert.equal(isTrustedMediaHttpUrl(ufs), true);

assert.equal(isTrustedMediaHttpUrl("https://example.com/image.jpg"), false);
assert.equal(isTrustedMediaHttpUrl("http://res.cloudinary.com/x.jpg"), false);
assert.equal(isTrustedMediaHttpUrl("https://localhost/image.jpg"), false);
assert.equal(isTrustedMediaHttpUrl("https://127.0.0.1/image.jpg"), false);
assert.equal(isTrustedMediaHttpUrl("https://192.168.1.1/image.jpg"), false);

assert.throws(
  () => validateTrustedMediaUrl("https://example.com/x"),
  UntrustedUrlError,
);

assert.throws(
  () => validateTrustedMediaUrl("ftp://utfs.io/x"),
  UntrustedUrlError,
);

assert.doesNotThrow(() => validateReplicateDeliveryUrl("https://pbxt.replicate.delivery/out.png"));

assert.equal(REMOTE_FETCH_LIMITS.MAX_BYTES, 50 * 1024 * 1024);
assert.equal(REMOTE_FETCH_LIMITS.MAX_REDIRECTS, 3);
assert.equal(REMOTE_FETCH_LIMITS.TIMEOUT_MS, 30_000);

console.log("verify-ssrf-guards: all checks passed");
