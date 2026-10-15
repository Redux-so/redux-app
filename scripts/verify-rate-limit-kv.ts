/**
 * Smoke test for production fail-closed KV rate limit behavior (no network).
 * Run: pnpm exec tsx scripts/verify-rate-limit-kv.ts
 */
import assert from "node:assert/strict";

async function main() {
  const savedEnv = { ...process.env };
  try {
    delete process.env.KV_REST_API_URL;
    process.env.VERCEL_ENV = "production";

    const { checkRateLimit, isProductionRateLimitEnforced } = await import(
      "../lib/kv"
    );
    assert.equal(isProductionRateLimitEnforced(), true);

    const blocked = await checkRateLimit("user-test", "export", 40);
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.unavailable, true);

    process.env.VERCEL_ENV = "development";
    const devAllowed = await checkRateLimit("user-test", "export", 40);
    assert.equal(devAllowed.allowed, true);
    assert.equal(devAllowed.unavailable, undefined);

    const { rateLimitDeniedResponse } = await import(
      "../lib/expensive-route-guard"
    );
    const denied = rateLimitDeniedResponse(blocked);
    assert.ok(denied);
    assert.equal(denied.status, 503);
  } finally {
    process.env = savedEnv;
  }

  console.log("verify-rate-limit-kv: ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
