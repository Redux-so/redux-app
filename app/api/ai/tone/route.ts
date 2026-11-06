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
import { fetchPreparedChatImage } from "@/lib/chat-image-context";
import { logSnippetForDiagnostics } from "@/lib/log-redaction";

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
  const { imageUrl } = parsed.data;

  const ownedImage = await assertUserOwnsImageUrl(user.id, imageUrl);
  if (!ownedImage) {
    return NextResponse.json({ error: "Image not found" }, { status: 404 });
  }

  const charge = await chargeCreditFeature({
    userId: user.id,
    feature: "auto_tone_balance",
  });
  if (!charge.ok) {
    return insufficientCreditsResponse();
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

    const cleaned = rawText.replace(/```(?:json)?\n?/g, "").replace(/```/g, "").trim();

    let adjustments: Partial<Record<AdjustmentKey, number>> = {};
    try {
      adjustments = JSON.parse(cleaned) as Partial<Record<AdjustmentKey, number>>;
    } catch {
      console.error(
        "[/api/ai/tone] Failed to parse JSON response:",
        logSnippetForDiagnostics(rawText),
      );
      await refundCreditFeature({
        userId: user.id,
        feature: "auto_tone_balance",
        description: "Refund: auto tone balance parse failure",
      });
      return NextResponse.json({ error: "Failed to parse AI response" }, { status: 500 });
    }

    return NextResponse.json({ adjustments });
  } catch (err) {
    console.error("[/api/ai/tone] Error:", err);
    await refundCreditFeature({
      userId: user.id,
      feature: "auto_tone_balance",
      description: "Refund: auto tone balance failed",
    });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
