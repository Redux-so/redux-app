import { NextResponse } from "next/server";
import sharp from "sharp";
import type { ImageBlockParam, TextBlockParam } from "@anthropic-ai/sdk/resources";
import { anthropic } from "@/lib/anthropic";
import { requireAuthUser } from "@/lib/require-user";
import {
  checkRateLimit,
  checkRateLimitPerMinute,
  RATE_LIMIT_MINUTE,
} from "@/lib/kv";
import { rateLimitDeniedResponse } from "@/lib/expensive-route-guard";
import type { AdjustmentKey } from "@/constants/adjustments";
import { normalizeAdjustmentPatch } from "@/constants/adjustments";
import { assertUserOwnsImageUrl } from "@/lib/verify-user-image";
import { parseJsonRequest, styleMatchBodySchema } from "@/lib/api-validation";
import {
  chargeCreditFeature,
  insufficientCreditsResponse,
  refundCreditFeature,
} from "@/lib/atomic-credits";
import { CREDIT_COSTS } from "@/constants/credits";
import { fetchTrustedMediaBuffer } from "@/lib/safe-remote-fetch";
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

function toThumbnailUrl(url: string): string {
  return url.replace("/upload/", "/upload/w_400,q_70,f_jpg/");
}

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
  if (minuteDenied) return minuteDenied;

  const rateLimit = await checkRateLimit(user.id, "style_match", 20);
  const hourlyDenied = rateLimitDeniedResponse(rateLimit);
  if (hourlyDenied) return hourlyDenied;

  const parsed = await parseJsonRequest(request, styleMatchBodySchema);
  if (!parsed.ok) {
    return parsed.response;
  }
  const { imageUrl, referenceImageBase64 } = parsed.data;

  const ownedImage = await assertUserOwnsImageUrl(user.id, imageUrl);
  if (!ownedImage) {
    return NextResponse.json({ error: "Image not found" }, { status: 404 });
  }

  const charge = await chargeCreditFeature({
    userId: user.id,
    feature: "style_match",
  });
  if (!charge.ok) {
    return insufficientCreditsResponse();
  }

  try {
    const thumbnailUrl = toThumbnailUrl(imageUrl);
    const { buffer } = await fetchTrustedMediaBuffer(thumbnailUrl);
    const targetBase64 = buffer.toString("base64");

    // Anthropic vision: PNG + max 1000px on longest side keeps payload under 5MB while
    // preserving enough detail for style analysis (Sharp accepts any common input format).
    const imageBuffer = Buffer.from(referenceImageBase64, "base64");
    const pngBuffer = await sharp(imageBuffer)
      .resize(1000, 1000, { fit: "inside", withoutEnlargement: true })
      .png()
      .toBuffer();
    const pngBase64 = pngBuffer.toString("base64");

    const userContent: (ImageBlockParam | TextBlockParam)[] = [
      {
        type: "image",
        source: { type: "base64", media_type: "image/jpeg", data: targetBase64 },
      },
      {
        type: "image",
        source: {
          type: "base64",
          media_type: "image/png",
          data: pngBase64,
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
      model: "claude-sonnet-4-5",
      max_tokens: 1024,
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
        "[/api/ai/style-match] Failed to parse JSON:",
        logSnippetForDiagnostics(rawText),
      );
      await refundCreditFeature({
        userId: user.id,
        feature: "style_match",
        description: "Refund: style match parse failure",
      });
      return NextResponse.json({ error: "Failed to parse AI response" }, { status: 500 });
    }

    return NextResponse.json({
      adjustments: normalizeAdjustmentPatch(
        adjustments as Partial<Record<string, number>>,
      ),
    });
  } catch (err) {
    console.error("[/api/ai/style-match]", err);
    await refundCreditFeature({
      userId: user.id,
      feature: "style_match",
      description: "Refund: style match failed",
    });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
