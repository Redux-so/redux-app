import { NextResponse } from "next/server";
import { VisionImageError } from "@/lib/chat-image-vision-server";
import { SafeFetchError } from "@/lib/safe-remote-fetch";

export class StyleMatchResponseError extends Error {}

/** Report actionable, safe errors without exposing provider headers, prompts or credentials. */
export function styleMatchErrorResponse(error: unknown) {
  if (error instanceof VisionImageError) return NextResponse.json({ error: error.message }, { status: 400 });
  if (error instanceof SafeFetchError) return NextResponse.json({ error: "Could not load the image for Style Match. Please try again." },
    { status: error.code === "TIMEOUT" ? 504 : 502 });
  if (error instanceof StyleMatchResponseError) return NextResponse.json({ error: "Style Match returned an invalid edit. Please try again." }, { status: 502 });
  const provider = error as { status?: number; headers?: Headers } | null;
  if (provider?.status === 429) {
    const value = Number(provider.headers?.get?.("retry-after"));
    const seconds = Number.isFinite(value) && value > 0 ? Math.min(86400, Math.ceil(value)) : null;
    return NextResponse.json({ error: seconds
      ? `The AI service is rate limited. Try Style Match again in ${seconds} seconds.`
      : "The AI service has reached a rate or usage limit. Please try again later or check the service limits." },
    { status: 429, headers: seconds ? { "Retry-After": String(seconds) } : {} });
  }
  if ([503, 529].includes(provider?.status ?? 0)) return NextResponse.json({ error: "The AI service is temporarily busy. Please try Style Match again shortly." }, { status: 503 });
  if ([401, 403].includes(provider?.status ?? 0)) return NextResponse.json({ error: "Style Match's AI service is unavailable. Please contact support." }, { status: 502 });
  return NextResponse.json({ error: "Style Match could not complete. Please try again." }, { status: 502 });
}
