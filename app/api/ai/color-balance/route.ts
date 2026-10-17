import { NextResponse } from "next/server";
import type { ImageBlockParam, TextBlockParam } from "@anthropic-ai/sdk/resources";
import { ANTHROPIC_DEFAULT_MODEL } from "@/constants/ai-models";
import { anthropic } from "@/lib/anthropic";
import { requireAuthUser } from "@/lib/require-user";
import {
  checkRateLimit,
  checkRateLimitPerMinute,
  RATE_LIMIT_MINUTE,
} from "@/lib/kv";
import { rateLimitDeniedResponse } from "@/lib/expensive-route-guard";
import type { AdjustmentKey } from "@/constants/adjustments";
import { assertUserOwnsImageUrl } from "@/lib/verify-user-image";
import { imageUrlOnlyBodySchema, parseJsonRequest } from "@/lib/api-validation";
import {
  chargeCreditFeature,
  insufficientCreditsResponse,
  refundCreditFeature,
} from "@/lib/atomic-credits";
import { CREDIT_COSTS } from "@/constants/credits";
import { fetchTrustedMediaBuffer } from "@/lib/safe-remote-fetch";
import { logSnippetForDiagnostics } from "@/lib/log-redaction";

const SYSTEM_PROMPT =
  "You are an expert photo editor specializing in color correction. Analyze this image for any " +
  "color casts, white balance issues, or unnatural color tones. Return ONLY a JSON object with " +
  "adjustment values to correct the colors and achieve natural, accurate color balance. Focus on " +
  "temperature, tint, vibrance, saturation, and hue. Return only adjustments that need to change " +
  "from 0. All values range from -100 to 100. No explanation, just the JSON object.";

function toThumbnailUrl(url: string): string {
  return url.replace("/upload/", "/upload/w_400,q_70,f_jpg/");
}

export async function POST(request: Request) {
  const authResult = await requireAuthUser();
  if ("error" in authResult) {
    return authResult.error;
  }
  const { user } = authResult;

  if (user.creditBalance < CREDIT_COSTS.smart_color_balance) {
    return insufficientCreditsResponse();
  }

  const minuteLimit = await checkRateLimitPerMinute(
    user.id,
    "color_balance",
    RATE_LIMIT_MINUTE.color_balance,
  );
  const minuteDenied = rateLimitDeniedResponse(minuteLimit);
  if (minuteDenied) return minuteDenied;

  const rateLimit = await checkRateLimit(user.id, "color_balance", 40);
  const hourlyDenied = rateLimitDeniedResponse(rateLimit);
  if (hourlyDenied) return hourlyDenied;

  const parsed = await parseJsonRequest(request, imageUrlOnlyBodySchema);
  if (!parsed.ok) {
    return parsed.response;
  }
  const { imageUrl } = parsed.data;

  const ownedImage = await assertUserOwnsImageUrl(user.id, imageUrl);
  if (!ownedImage) {
    return NextResponse.json({ error: "Image not found" }, { status: 404 });
  }

  const charge = await chargeCreditFeature({
    userId: user.id,
    feature: "smart_color_balance",
  });
  if (!charge.ok) {
    return insufficientCreditsResponse();
  }

  try {
    const thumbnailUrl = toThumbnailUrl(imageUrl);
    const { buffer } = await fetchTrustedMediaBuffer(thumbnailUrl);
    const base64 = buffer.toString("base64");

    const userContent: (ImageBlockParam | TextBlockParam)[] = [
      {
        type: "image",
        source: { type: "base64", media_type: "image/jpeg", data: base64 },
      },
      {
        type: "text",
        text: "Analyze this image and return optimal color balance adjustment values.",
      },
    ];

    const response = await anthropic.messages.create({
      model: ANTHROPIC_DEFAULT_MODEL,
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }],
    });

    const rawText =
      response.content[0]?.type === "text" ? response.content[0].text : "";

    const cleaned = rawText.replace(/```(?:json)?\n?/g, "").replace(/```/g, "").trim();

    let adjustments: Partial<Record<AdjustmentKey, number>> = {};
    try {
      adjustments = JSON.parse(cleaned) as Partial<Record<AdjustmentKey, number>>;
    } catch {
      console.error(
        "[/api/ai/color-balance] Failed to parse JSON response:",
        logSnippetForDiagnostics(rawText),
      );
      await refundCreditFeature({
        userId: user.id,
        feature: "smart_color_balance",
        description: "Refund: smart color balance parse failure",
      });
      return NextResponse.json({ error: "Failed to parse AI response" }, { status: 500 });
    }

    return NextResponse.json({ adjustments });
  } catch (err) {
    console.error("[/api/ai/color-balance] Error:", err);
    await refundCreditFeature({
      userId: user.id,
      feature: "smart_color_balance",
      description: "Refund: smart color balance failed",
    });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
