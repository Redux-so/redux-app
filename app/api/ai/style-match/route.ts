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
import { normalizeAdjustmentPatch } from "@/constants/adjustments";
import { assertUserOwnsImageUrl } from "@/lib/verify-user-image";
import { parseJsonRequest, styleMatchBodySchema, adjustmentsRecordSchema } from "@/lib/api-validation";
import {
  chargeCreditFeature,
  insufficientCreditsResponse,
  refundCreditFeature,
} from "@/lib/atomic-credits";
import { CREDIT_COSTS } from "@/constants/credits";
import { fetchPreparedChatImage } from "@/lib/chat-image-context";
import { prepareChatVisionBase64 } from "@/lib/chat-image-vision-server";
import { styleMatchErrorResponse, StyleMatchResponseError } from "@/lib/style-match-error";
import { logSnippetForDiagnostics } from "@/lib/log-redaction";

const SYSTEM_PROMPT =
  "You are an expert photo editor specializing in color grading and style transfer. " +
  "Analyze the reference image and identify its visual style — including color temperature, " +
  "contrast, saturation, shadows, highlights, and overall mood. Then return ONLY a JSON object " +
  "of adjustment values that would make the target image match the style of the reference image. " +
  "Available adjustments: exposure, contrast, blacks, whites, highlights, shadows, " +
  "vibrance, saturation, temperature, tint, hue, sharpen, vignette, grain, clarity. " +
  "All values range from -100 to 100. Only include adjustments that need to change from 0. " +
  "No explanation, just the JSON.";

export async function POST(request: Request) {
  const authResult = await requireAuthUser();
  if ("error" in authResult) {
    return authResult.error;
  }
  const { user } = authResult;

  if (user.creditBalance < CREDIT_COSTS.style_match) {
    return insufficientCreditsResponse();
  }

  const minuteLimit = await checkRateLimitPerMinute(
    user.id,
    "style_match",
    RATE_LIMIT_MINUTE.style_match,
  );
  const minuteDenied = rateLimitDeniedResponse(minuteLimit);
  if (minuteDenied) {
    if (minuteDenied.status === 429) return NextResponse.json(
      { error: "Style Match is limited to 5 attempts per minute. Try again in up to 1 minute." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
    return minuteDenied;
  }

  const rateLimit = await checkRateLimit(user.id, "style_match", 20);
  const hourlyDenied = rateLimitDeniedResponse(rateLimit);
  if (hourlyDenied) {
    if (hourlyDenied.status === 429) return NextResponse.json(
      { error: "Style Match is limited to 20 attempts per hour. Try again in up to 1 hour." },
      { status: 429, headers: { "Retry-After": "3600" } },
    );
    return hourlyDenied;
  }

  const parsed = await parseJsonRequest(request, styleMatchBodySchema);
  if (!parsed.ok) {
    return parsed.response;
  }
  const { imageUrl, referenceImageBase64 } = parsed.data;

  const ownedImage = await assertUserOwnsImageUrl(user.id, imageUrl);
  if (!ownedImage) {
    return NextResponse.json({ error: "Image not found" }, { status: 404 });
  }

  // Validate and normalize both images before charging or asking the model.
  let target: Awaited<ReturnType<typeof prepareChatVisionBase64>>;
  let reference: Awaited<ReturnType<typeof prepareChatVisionBase64>>;
  try {
    [target, reference] = await Promise.all([
      fetchPreparedChatImage(imageUrl),
      prepareChatVisionBase64(referenceImageBase64),
    ]);
  } catch (error) {
    console.error("[/api/ai/style-match] Image preparation failed:", error);
    return styleMatchErrorResponse(error);
  }

  const charge = await chargeCreditFeature({
    userId: user.id,
    feature: "style_match",
  });
  if (!charge.ok) {
    return insufficientCreditsResponse();
  }

  try {
    const userContent: (ImageBlockParam | TextBlockParam)[] = [
      {
        type: "image",
        source: { type: "base64", media_type: target.mediaType, data: target.base64 },
      },
      {
        type: "image",
        source: {
          type: "base64",
          media_type: reference.mediaType,
          data: reference.base64,
        },
      },
      {
        type: "text",
        text:
          "The first image is the target photo to edit. The second image is the reference " +
          "whose style should be matched. Return only the JSON object of adjustments.",
      },
    ];

    const response = await anthropic.messages.create({
      model: ANTHROPIC_DEFAULT_MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }],
    });

    const rawText =
      response.content[0]?.type === "text" ? response.content[0].text : "";

    const cleaned = rawText.replace(/```(?:json)?\n?/g, "").replace(/```/g, "").trim();

    let parsedResponse: unknown;
    try { parsedResponse = JSON.parse(cleaned); }
    catch {
      console.error("[/api/ai/style-match] Invalid JSON:", logSnippetForDiagnostics(rawText));
      throw new StyleMatchResponseError();
    }
    const validated = adjustmentsRecordSchema.safeParse(parsedResponse);
    if (!validated.success) throw new StyleMatchResponseError();
    return NextResponse.json({ adjustments: normalizeAdjustmentPatch(validated.data) });
  } catch (err) {
    console.error("[/api/ai/style-match]", err);
    await refundCreditFeature({
      userId: user.id,
      feature: "style_match",
      description: "Refund: style match failed",
    });
    return styleMatchErrorResponse(err);
  }
}
