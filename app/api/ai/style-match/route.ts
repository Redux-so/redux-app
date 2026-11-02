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
import { DEFAULT_ADJUSTMENTS } from "@/constants/adjustments";
import { assertUserOwnsImageUrl } from "@/lib/verify-user-image";
import { parseJsonRequest, styleMatchBodySchema } from "@/lib/api-validation";
import {
  chargeCreditFeature,
  insufficientCreditsResponse,
  refundCreditFeature,
} from "@/lib/atomic-credits";
import { CREDIT_COSTS } from "@/constants/credits";
import { fetchTrustedMediaBuffer } from "@/lib/safe-remote-fetch";
import { uploadToCloudinary, deleteFromCloudinary } from "@/lib/cloudinary";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { extractStylePalette, describeStylePalette, transferStylePalette } from "@/lib/style-match-palette";
import { prepareChatVisionBase64, VisionImageError } from "@/lib/chat-image-vision-server";
import { styleMatchErrorResponse, StyleMatchResponseError } from "@/lib/style-match-error";
import { logSnippetForDiagnostics } from "@/lib/log-redaction";

export const maxDuration = 300;

const SYSTEM_PROMPT = `You match photographic palettes between two photos.
The first image is the TARGET whose content must stay unchanged. The second is the REFERENCE.
You will receive numbered palettes extracted from the actual pixels of each image, in sRGB.
For EVERY target swatch choose a reference swatch with the corresponding visual role/material:
sky to sky, foliage/grass to foliage/grass, skin to skin, buildings to buildings, shadows to shadows.
Do not pair solely by nearest RGB: muted yellow-green grass may need the reference's rich green,
blue sky may need pale gray/cyan, neutral buildings may need warm cream highlights.
Preserve brightness ordering within a material: use different reference shades where available.
When a material is absent, choose a compatible color with similar luminance and a natural palette.
Choose only supplied palette IDs. Do not invent colors or slider values.
The renderer transfers these colors directly, preserving the target's detail and composition.
Return ONLY {"matches":[{"target":0,"reference":2},...]} covering every target ID exactly once.
Multiple target swatches may share a reference swatch. No explanations or markdown.`;

const paletteMatchesSchema = z.object({ matches: z.array(z.object({
  target: z.number().int().min(0).max(11), reference: z.number().int().min(0).max(11),
}).strict()).min(1).max(12) }).strict();

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
  let source: Buffer;
  let targetPalette: Awaited<ReturnType<typeof extractStylePalette>>;
  let referencePalette: Awaited<ReturnType<typeof extractStylePalette>>;
  try {
    const [fetched, preparedReference] = await Promise.all([
      fetchTrustedMediaBuffer(imageUrl),
      prepareChatVisionBase64(referenceImageBase64),
    ]);
    source = fetched.buffer;
    reference = preparedReference;
    // Analyze copies; always grade the native source, never a CDN thumbnail.
    target = await prepareChatVisionBase64(source.toString("base64"));
    try {
      [targetPalette, referencePalette] = await Promise.all([
        extractStylePalette(Buffer.from(target.base64, "base64")),
        extractStylePalette(Buffer.from(reference.base64, "base64")),
      ]);
    } catch { throw new VisionImageError(); }
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
          `TARGET palette: ${JSON.stringify(describeStylePalette(targetPalette))}\n` +
          `REFERENCE palette: ${JSON.stringify(describeStylePalette(referencePalette))}\n` +
          "Match every target swatch to the reference by visual role/material and tone.",
      },
    ];

    const response = await anthropic.messages.create({
      model: ANTHROPIC_DEFAULT_MODEL,
      max_tokens: 1024,
      temperature: 0,
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
    const validated = paletteMatchesSchema.safeParse(parsedResponse);
    if (!validated.success || validated.data.matches.length !== targetPalette.length ||
        new Set(validated.data.matches.map(m => m.target)).size !== targetPalette.length ||
        validated.data.matches.some(m => !targetPalette[m.target] || !referencePalette[m.reference])) {
      throw new StyleMatchResponseError();
    }
    const result = await transferStylePalette(source, targetPalette, referencePalette, validated.data.matches);
    const uploaded = await uploadToCloudinary(result, `${ownedImage.id}_style-match.png`);
    try {
      // Register the immutable source for subsequent edits, undo, and cleanup.
      await prisma.imageVersion.create({ data: { imageId: ownedImage.id, url: uploaded.secureUrl,
        publicId: uploaded.publicId, adjustments: { operationResult: true }, label: "Style Match" } });
    } catch (error) {
      await deleteFromCloudinary(uploaded.publicId).catch(() => {});
      throw error;
    }
    // Colors are baked into the new source. Reset sliders in the same history
    // checkpoint as the source replacement so neither entry point double-grades it.
    return NextResponse.json({ resultUrl: uploaded.secureUrl, adjustments: { ...DEFAULT_ADJUSTMENTS } });
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
