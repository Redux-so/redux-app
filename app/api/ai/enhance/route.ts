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
  "You are an expert photo editor. Analyze this image and return optimal adjustment values " +
  "to enhance it. Consider the exposure, white balance, contrast, and color. Return ONLY a " +
  "JSON object with adjustment values, no explanation. Available adjustments: exposure, " +
  "contrast, blacks, whites, highlights, shadows, vibrance, saturation, temperature, " +
  "tint. All values range from -100 to 100. Only include adjustments that need to change from 0.";

/**
 * Insert a w_400,q_70,f_jpg transformation into a Cloudinary upload URL so we
 * fetch a small JPEG thumbnail instead of the full-res image.
 */
export async function POST(request: Request) {
  const authResult = await requireAuthUser();
  if ("error" in authResult) {
    return authResult.error;
  }
  const { user } = authResult;

  if (user.creditBalance < CREDIT_COSTS.auto_enhance) {
    return insufficientCreditsResponse();
  }

  const minuteLimit = await checkRateLimitPerMinute(
    user.id,
    "enhance",
    RATE_LIMIT_MINUTE.enhance,
  );
  const minuteDenied = rateLimitDeniedResponse(minuteLimit);
  if (minuteDenied) return minuteDenied;

  const rateLimit = await checkRateLimit(user.id, "enhance", 40);
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
        text: "Analyze this image and return optimal adjustment values to enhance it.",
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

    // Strip markdown code fences if the model wraps its JSON
    const adjustments = parseUsefulAdjustmentPatch(rawText, currentAdjustments);
    if (!adjustments) return NextResponse.json({ error: "The AI did not return usable changes." }, { status: 422 });

    const charge = await chargeCreditFeature({ userId: user.id, feature: "auto_enhance" });
    if (!charge.ok) return insufficientCreditsResponse();
    return NextResponse.json({ adjustments });
  } catch (err) {
    return apiInternalErrorResponse("/api/ai/enhance", err, "Could not analyze the image. Please try again.");
  }
}
