import { NextResponse } from "next/server";
import {
  checkRateLimit,
  checkRateLimitPerMinute,
  RATE_LIMIT_HOURLY,
  RATE_LIMIT_MINUTE,
  type RateLimitFeature,
  type RateLimitResult,
} from "@/lib/kv";

export const RATE_LIMIT_TOO_MANY =
  "Too many requests. Please slow down." as const;

export const RATE_LIMIT_KV_UNAVAILABLE =
  "Service temporarily unavailable. Please try again in a moment." as const;

export function rateLimitDeniedResponse(
  result: RateLimitResult,
): NextResponse | null {
  return rateLimitResponse(result);
}

function rateLimitResponse(result: RateLimitResult): NextResponse | null {
  if (result.unavailable) {
    return NextResponse.json(
      { error: RATE_LIMIT_KV_UNAVAILABLE },
      { status: 503 },
    );
  }
  if (!result.allowed) {
    return NextResponse.json({ error: RATE_LIMIT_TOO_MANY }, { status: 429 });
  }
  return null;
}

/**
 * Enforces per-minute and hourly KV rate limits for a feature.
 * Returns a JSON error response when blocked, or null when the request may proceed.
 */
export async function enforceFeatureRateLimits(
  userId: string,
  feature: RateLimitFeature,
  options?: { minuteLimit?: number; hourlyLimit?: number },
): Promise<NextResponse | null> {
  const minuteLimit =
    options?.minuteLimit ??
    RATE_LIMIT_MINUTE[feature as keyof typeof RATE_LIMIT_MINUTE];
  const hourlyLimit =
    options?.hourlyLimit ??
    RATE_LIMIT_HOURLY[feature as keyof typeof RATE_LIMIT_HOURLY];

  if (minuteLimit === undefined || hourlyLimit === undefined) {
    throw new Error(`Unknown rate limit feature: ${feature}`);
  }

  const minuteResult = await checkRateLimitPerMinute(
    userId,
    feature,
    minuteLimit,
  );
  const minuteBlocked = rateLimitResponse(minuteResult);
  if (minuteBlocked) {
    return minuteBlocked;
  }

  const hourlyResult = await checkRateLimit(userId, feature, hourlyLimit);
  return rateLimitResponse(hourlyResult);
}

export function insufficientCreditsResponse(): NextResponse {
  return NextResponse.json({ error: "Insufficient credits" }, { status: 402 });
}
