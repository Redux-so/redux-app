import { NextResponse } from "next/server";
import type { ImageBlockParam, TextBlockParam } from "@anthropic-ai/sdk/resources";
import { anthropic } from "@/lib/anthropic";
import { prisma } from "@/lib/prisma";
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
import { fetchTrustedMediaBuffer } from "@/lib/safe-remote-fetch";
import { logSnippetForDiagnostics } from "@/lib/log-redaction";

const SYSTEM_PROMPT =
  "You are an expert photo editor. Analyze this image and return optimal tone adjustments only. " +
  "Focus specifically on exposure, contrast, highlights, shadows, blacks, and whites to achieve " +
  "a well-balanced tone. Return ONLY a JSON object with these adjustment values, no explanation. " +
  "Values range from -100 to 100. Only include adjustments that need to change from 0.";

function toThumbnailUrl(url: string): string {
  return url.replace("/upload/", "/upload/w_400,q_70,f_jpg/");
}

export async function POST(request: Request) {
  const authResult = await requireAuthUser();
  if ("error" in authResult) {
    return authResult.error;
  }
  const { user } = authResult;

  if (user.creditBalance < 1) {
    return NextResponse.json({ error: "Insufficient credits" }, { status: 402 });
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

  // Deduct credit before calling the API
  await prisma.user.update({
    where: { id: user.id },
    data: { creditBalance: { decrement: 1 } },
  });
  await prisma.creditTransaction.create({
    data: {
      userId: user.id,
      type: "DEDUCTION",
      amount: -1,
      feature: "auto_tone_balance",
    },
  });

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
        text: "Analyze this image and return optimal tone adjustment values.",
      },
    ];

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
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
        "[/api/ai/tone] Failed to parse JSON response:",
        logSnippetForDiagnostics(rawText),
      );
      await prisma.user.update({
        where: { id: user.id },
        data: { creditBalance: { increment: 1 } },
      });
      return NextResponse.json({ error: "Failed to parse AI response" }, { status: 500 });
    }

    return NextResponse.json({ adjustments });
  } catch (err) {
    console.error("[/api/ai/tone] Error:", err);
    await prisma.user.update({
      where: { id: user.id },
      data: { creditBalance: { increment: 1 } },
    });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
