import { kv } from "@vercel/kv";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** True when production requires KV but it is missing or errored. */
  unavailable?: boolean;
}

/** Per-minute burst limits (60 s window). Hourly limits in RATE_LIMIT_HOURLY. */
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
  erase: 5,
  embed: 5,
  blur: 10,
  image_upload: 10,
  export: 15,
  preview: 20,
  canvas_preview: 120,
  save_version: 10,
  list_versions: 30,
} as const;

/** Hourly sliding-window limits keyed per user + feature. */
export const RATE_LIMIT_HOURLY = {
  enhance: 40,
  tone: 40,
  color_balance: 40,
  style_match: 20,
  heal: 20,
  background_remove: 20,
  generative_fill: 20,
  semantic_search: 20,
  chat_free: 10,
  chat_credit: 60,
  erase: 20,
  embed: 20,
  blur: 30,
  image_upload: 30,
  export: 40,
  preview: 60,
  canvas_preview: 1500,
  save_version: 30,
  list_versions: 120,
} as const;

export type RateLimitFeature =
  | keyof typeof RATE_LIMIT_MINUTE
  | keyof typeof RATE_LIMIT_HOURLY;

function isKvConfigured(): boolean {
  return Boolean(process.env.KV_REST_API_URL);
}

/** Production must not run without working KV-backed rate limits. */
export function isProductionRateLimitEnforced(): boolean {
  return process.env.VERCEL_ENV === "production";
}

function kvUnavailableResult(): RateLimitResult {
  return { allowed: false, remaining: 0, unavailable: true };
}

function resolveKvAvailability(limit: number): RateLimitResult | null {
  if (isKvConfigured()) {
    return null;
  }
  if (isProductionRateLimitEnforced()) {
    return kvUnavailableResult();
  }
  return { allowed: true, remaining: limit };
}

/**
 * Per-minute burst rate limit keyed per user + feature.
 * Key: rate:minute:{feature}:{userId}  TTL: 60 s
 *
 * Local dev without KV: allowed. Production without KV: denied (unavailable).
 */
export async function checkRateLimitPerMinute(
  userId: string,
  feature: string,
  limit: number,
): Promise<RateLimitResult> {
  const availability = resolveKvAvailability(limit);
  if (availability) {
    return availability;
  }

  try {
    const key = `rate:minute:${feature}:${userId}`;
    const count = await kv.incr(key);
    if (count === 1) {
      await kv.expire(key, 60);
    }
    return { allowed: count <= limit, remaining: Math.max(0, limit - count) };
  } catch {
    if (isProductionRateLimitEnforced()) {
      return kvUnavailableResult();
    }
    return { allowed: true, remaining: limit };
  }
}

/**
 * Hourly sliding-window rate limit keyed per user + feature.
 * Key: rate:{feature}:{userId}  TTL: 3600 s
 *
 * Local dev without KV: allowed. Production without KV: denied (unavailable).
 */
export async function checkRateLimit(
  userId: string,
  feature: string,
  limit: number,
): Promise<RateLimitResult> {
  const availability = resolveKvAvailability(limit);
  if (availability) {
    return availability;
  }

  try {
    const key = `rate:${feature}:${userId}`;
    const count = await kv.incr(key);
    if (count === 1) {
      await kv.expire(key, 3600);
    }
    return { allowed: count <= limit, remaining: Math.max(0, limit - count) };
  } catch {
    if (isProductionRateLimitEnforced()) {
      return kvUnavailableResult();
    }
    return { allowed: true, remaining: limit };
  }
}
