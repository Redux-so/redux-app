/**
 * PERF-03: ensure upload route schedules CLIP embedding via Next `after()` (Vercel waitUntil).
 * Run: pnpm exec tsx scripts/verify-background-embedding.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const imagesRoute = readFileSync("app/api/images/route.ts", "utf8");
assert.match(
  imagesRoute,
  /scheduleImageEmbeddingAfterResponse\s*\(/,
  "POST /api/images must schedule embedding after the response",
);
assert.doesNotMatch(
  imagesRoute,
  /void\s+generateAndPersistImageEmbedding/,
  "Fire-and-forget void promise is unreliable on Vercel serverless",
);
assert.match(
  imagesRoute,
  /export const maxDuration = 60/,
  "Route maxDuration must allow Replicate work in after()",
);

const scheduler = readFileSync("lib/schedule-image-embedding.ts", "utf8");
assert.match(scheduler, /from "next\/server"/);
assert.match(scheduler, /\bafter\s*\(/);
assert.match(scheduler, /logApiError/);
assert.match(scheduler, /BACKGROUND_EMBED_MAX_ATTEMPTS = 2/);

console.log("verify-background-embedding: all checks passed");
