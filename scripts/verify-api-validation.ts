/**
 * SEC-05 manual QA for Zod API schemas (no auth / HTTP required).
 * Run: pnpm exec tsx scripts/verify-api-validation.ts
 */
import assert from "node:assert/strict";
import {
  API_LIMITS,
  chatRequestBodySchema,
  exportBodySchema,
  generativeFillBodySchema,
  parseRequestBody,
  parseSearchQueryParam,
} from "../lib/api-validation";

function expectFail(schema: Parameters<typeof parseRequestBody>[0], raw: unknown) {
  const result = parseRequestBody(schema, raw);
  assert.equal(result.ok, false, `Expected validation failure for ${JSON.stringify(raw).slice(0, 80)}`);
}

function expectOk<T>(schema: Parameters<typeof parseRequestBody<T>>[0], raw: unknown) {
  const result = parseRequestBody(schema, raw);
  assert.equal(result.ok, true, `Expected validation success for ${JSON.stringify(raw).slice(0, 80)}`);
  return result.ok ? result.data : null;
}

const validImageId = "cltest1234567890";
const validUrl = "https://res.cloudinary.com/demo/image/upload/sample.jpg";
const untrustedUrl = "https://example.com/image.jpg";
const uploadthingUrl = "https://utfs.io/f/test-file";
const tinyBase64 = Buffer.from("hello").toString("base64");

// Valid export request
expectOk(exportBodySchema, {
  imageId: validImageId,
  format: "jpeg",
  quality: 90,
  maxWidth: 512,
  imageUrl: validUrl,
});

// Invalid export dimensions
expectFail(exportBodySchema, {
  imageId: validImageId,
  maxWidth: 99_999,
});

// Malformed URL
expectFail(exportBodySchema, {
  imageId: validImageId,
  imageUrl: "not-a-url",
});

// Untrusted remote URL (SSRF guard)
expectFail(exportBodySchema, {
  imageId: validImageId,
  imageUrl: untrustedUrl,
});

// Trusted UploadThing URL
expectOk(exportBodySchema, {
  imageId: validImageId,
  imageUrl: uploadthingUrl,
});

// Invalid enum
expectFail(exportBodySchema, {
  imageId: validImageId,
  format: "bmp",
});

// Oversized base64 (character limit)
const oversizedBase64 = "A".repeat(API_LIMITS.BASE64_MAX_CHARS + 1);
expectFail(exportBodySchema, {
  imageId: validImageId,
  imageBase64: oversizedBase64,
});

// Valid chat
expectOk(chatRequestBodySchema, {
  userMessage: "Make it warmer",
  conversationHistory: [{ role: "user", content: "Hi" }],
  imageBase64: tinyBase64,
  imageMediaType: "image/jpeg",
  chatInteractionMode: "ask",
});

expectFail(chatRequestBodySchema, {
  userMessage: "test",
  chatInteractionMode: "invalid",
});

// Excessive chat history
const longHistory = Array.from({ length: API_LIMITS.CHAT_HISTORY_MAX_MESSAGES + 1 }, (_, i) => ({
  role: "user" as const,
  content: `msg ${i}`,
}));
expectFail(chatRequestBodySchema, {
  userMessage: "test",
  conversationHistory: longHistory,
});

// Invalid chat enum
expectFail(chatRequestBodySchema, {
  userMessage: "test",
  imageMediaType: "image/bmp",
});

// Generative fill enum + numeric range
expectOk(generativeFillBodySchema, {
  imageUrl: validUrl,
  expandDirection: "left",
  expandPixels: 64,
  prompt: "extend sky",
});

expectFail(generativeFillBodySchema, {
  imageUrl: validUrl,
  expandDirection: "diagonal",
  expandPixels: 64,
  prompt: "extend sky",
});

expectFail(generativeFillBodySchema, {
  imageUrl: validUrl,
  expandDirection: "top",
  expandPixels: 900,
  prompt: "extend sky",
});

// Search query
assert.equal(parseSearchQueryParam("sunset").ok, true);
assert.equal(parseSearchQueryParam("").ok, false);
assert.equal(
  parseSearchQueryParam("x".repeat(API_LIMITS.SEARCH_QUERY_MAX + 1)).ok,
  false,
);

console.log("verify-api-validation: all checks passed");
