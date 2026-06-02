import { kv } from "@vercel/kv";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
}

/** Per-minute burst limits (60 s window). Hourly limits unchanged in checkRateLimit. */
export const RATE_LIMIT_MINUTE = {
  enhance: 10,
  tone: 10,
  color_balance: 10,
  style_match: 5,
  heal: 5,
  background_remove: 5,
  generative_fill: 5,
  semantic_search: 5,
  chat_free: 5,
  chat_credit: 15,
} as const;

/**
 * Per-minute burst rate limit keyed per user + feature.
 * Key: rate:minute:{feature}:{userId}  TTL: 60 s
 *
 * Falls back to "allowed" when Vercel KV is not configured (local dev).
 */
export async function checkRateLimitPerMinute(
  userId: string,
  feature: string,
  limit: number,
): Promise<RateLimitResult> {
  if (!process.env.KV_REST_API_URL) {
    return { allowed: true, remaining: limit };
  }

  try {
    const key = `rate:minute:${feature}:${userId}`;
    const count = await kv.incr(key);
    if (count === 1) {
      await kv.expire(key, 60);
    }
    return { allowed: count <= limit, remaining: Math.max(0, limit - count) };
  } catch {
    return { allowed: true, remaining: limit };
  }
}

/**
 * Hourly sliding-window rate limit keyed per user + feature.
 * Key: rate:{feature}:{userId}  TTL: 3600 s
 *
 * Falls back to "allowed" when Vercel KV is not configured (local dev).
 */
export async function checkRateLimit(
  userId: string,
  feature: string,
  limit: number,
): Promise<RateLimitResult> {
  if (!process.env.KV_REST_API_URL) {
    return { allowed: true, remaining: limit };
  }

  try {
    const key = `rate:${feature}:${userId}`;
    const count = await kv.incr(key);
    if (count === 1) {
      await kv.expire(key, 3600);
    }
    return { allowed: count <= limit, remaining: Math.max(0, limit - count) };
  } catch {
    // KV unavailable — fail open so users aren't blocked
    return { allowed: true, remaining: limit };
  }
}
