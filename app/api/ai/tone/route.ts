import { NextResponse } from "next/server";
import { apiInternalErrorResponse } from "@/lib/api-error";
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
import { assertUserOwnsImageUrl } from "@/lib/verify-user-image";
import { imageUrlOnlyBodySchema, parseJsonRequest } from "@/lib/api-validation";
import {
  chargeCreditFeature,
  insufficientCreditsResponse,
} from "@/lib/atomic-credits";
import { CREDIT_COSTS } from "@/constants/credits";
import { fetchPreparedChatImage } from "@/lib/chat-image-context";
import { parseUsefulAdjustmentPatch } from "@/lib/ai-adjustment-result";

const SYSTEM_PROMPT =
  "You are an expert photo editor. Analyze this image and return optimal tone adjustments only. " +
  "Focus specifically on exposure, contrast, highlights, shadows, blacks, and whites to achieve " +
  "a well-balanced tone. Return ONLY a JSON object with these adjustment values, no explanation. " +
  "Values range from -100 to 100. Only include adjustments that need to change from 0.";

export async function POST(request: Request) {
  const authResult = await requireAuthUser();
  if ("error" in authResult) {
    return authResult.error;
  }
  const { user } = authResult;

  if (user.creditBalance < CREDIT_COSTS.auto_tone_balance) {
    return insufficientCreditsResponse();
  }

  const minuteLimit = await checkRateLimitPerMinute(
    user.id,
    "tone",
    RATE_LIMIT_MINUTE.tone,
  );
  const minuteDenied = rateLimitDeniedResponse(minuteLimit);
  if (minuteDenied) return minuteDenied;

  const rateLimit = await checkRateLimit(user.id, "tone", 40);
  const hourlyDenied = rateLimitDeniedResponse(rateLimit);
  if (hourlyDenied) return hourlyDenied;

  const parsed = await parseJsonRequest(request, imageUrlOnlyBodySchema);
  if (!parsed.ok) {
    return parsed.response;
  }
  const { imageUrl, currentAdjustments } = parsed.data;

  const ownedImage = await assertUserOwnsImageUrl(user.id, imageUrl);
  if (!ownedImage) {
    return NextResponse.json({ error: "Image not found" }, { status: 404 });
  }

  try {
    const { base64, mediaType } = await fetchPreparedChatImage(imageUrl);

    const userContent: (ImageBlockParam | TextBlockParam)[] = [
      {
        type: "image",
        source: { type: "base64", media_type: mediaType, data: base64 },
      },
      {
        type: "text",
        text: "Analyze this image and return optimal tone adjustment values.",
      },
    ];

    const response = await anthropic.messages.create({
      model: ANTHROPIC_DEFAULT_MODEL,
      thinking: { type: "disabled" },
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }],
    });

    const rawText =
      response.stop_reason === "refusal" || response.stop_reason === "max_tokens"
        ? ""
        : response.content.flatMap(block => block.type === "text" ? [block.text] : []).join("");

    const adjustments = parseUsefulAdjustmentPatch(rawText, currentAdjustments);
    if (!adjustments) return NextResponse.json({ error: "The AI did not return usable changes." }, { status: 422 });

    const charge = await chargeCreditFeature({ userId: user.id, feature: "auto_tone_balance" });
    if (!charge.ok) return insufficientCreditsResponse();
    return NextResponse.json({ adjustments });
  } catch (err) {
    return apiInternalErrorResponse("/api/ai/tone", err, "Could not analyze the image. Please try again.");
  }
}
