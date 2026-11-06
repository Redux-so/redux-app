import { NextResponse } from "next/server";
import Replicate from "replicate";
import sharp from "sharp";
import { uploadToCloudinary } from "@/lib/cloudinary";
import { prisma } from "@/lib/prisma";
import { apiInternalErrorResponse } from "@/lib/api-error";
import { requireAuthUser } from "@/lib/require-user";
import {
  checkRateLimit,
  checkRateLimitPerMinute,
  RATE_LIMIT_MINUTE,
} from "@/lib/kv";
import { rateLimitDeniedResponse } from "@/lib/expensive-route-guard";
import { assertUserOwnsImageUrl } from "@/lib/verify-user-image";
import { generativeFillBodySchema, parseJsonRequest } from "@/lib/api-validation";
import {
  chargeCreditFeature,
  insufficientCreditsResponse,
  refundCreditFeature,
} from "@/lib/atomic-credits";
import { CREDIT_COSTS } from "@/constants/credits";
import {
  fetchReplicateDeliveryBuffer,
  withTrustedEditorImage,
} from "@/lib/safe-remote-fetch";

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

const REPLICATE_MODEL =
  "stability-ai/stable-diffusion-inpainting:95b7223104132402a9ae91cc677285bc5eb997834bd2349fa486f53910fd68b3";

const ALLOWED_INPAINT_DIMS = [
  64, 128, 192, 256, 320, 384, 448, 512, 576, 640, 704, 768, 832, 896, 960, 1024,
] as const;

function roundToNearestAllowedDimension(n: number): number {
  const clamped = Math.max(64, Math.min(1024, Math.round(n)));
  let best: (typeof ALLOWED_INPAINT_DIMS)[number] = ALLOWED_INPAINT_DIMS[0];
  let bestDist = Math.abs(clamped - best);
  for (const d of ALLOWED_INPAINT_DIMS) {
    const dist = Math.abs(clamped - d);
    if (dist < bestDist) {
      best = d;
      bestDist = dist;
    }
  }
  return best;
}

function extractOutputUrl(output: unknown): string {
  if (typeof output === "string") return output;
  if (Array.isArray(output) && output.length > 0) {
    const first = output[0] as unknown;
    if (first && typeof (first as Record<string, unknown>).url === "function") {
      return ((first as Record<string, unknown>).url as () => URL)().href;
    }
    return String(first);
  }
  if (output && typeof (output as Record<string, unknown>).url === "function") {
    return ((output as Record<string, unknown>).url as () => URL)().href;
  }
  throw new Error(`Unexpected Replicate output shape: ${String(output)}`);
}

export async function POST(request: Request) {
  try {
    const authResult = await requireAuthUser();
    if ("error" in authResult) {
      return authResult.error;
    }
    const { user } = authResult;

      if (user.creditBalance < CREDIT_COSTS.generative_fill) {
      return insufficientCreditsResponse();
    }

    const minuteLimit = await checkRateLimitPerMinute(
      user.id,
      "generative_fill",
      RATE_LIMIT_MINUTE.generative_fill,
    );
    const minuteDenied = rateLimitDeniedResponse(minuteLimit);
    if (minuteDenied) return minuteDenied;

    const rateLimit = await checkRateLimit(user.id, "generative_fill", 20);
    const hourlyDenied = rateLimitDeniedResponse(rateLimit);
    if (hourlyDenied) return hourlyDenied;

    const parsed = await parseJsonRequest(request, generativeFillBodySchema);
    if (!parsed.ok) {
      return parsed.response;
    }
    const { imageUrl, expandDirection, expandPixels, prompt } = parsed.data;
    const trimmedPrompt = prompt;
    const px = expandPixels;

    const image = await assertUserOwnsImageUrl(user.id, imageUrl);
    if (!image) {
      return NextResponse.json({ error: "Image not found" }, { status: 404 });
    }

    const charge = await chargeCreditFeature({
      userId: user.id,
      feature: "generative_fill",
    });
    if (!charge.ok) {
      return insufficientCreditsResponse();
    }

    try {
      const { resizedImage, resizedMask, modelW, modelH } = await withTrustedEditorImage(imageUrl, async (path) => {
        const source = sharp(path, { sequentialRead: true }).autoOrient();
        const { autoOrient: { width, height } } = await source.metadata();
        const horizontal = expandDirection === "left" || expandDirection === "right";
        const expandedWidth = width + (horizontal ? px : 0);
        const expandedHeight = height + (horizontal ? 0 : px);
        const scale = Math.min(1, 1024 / Math.max(expandedWidth, expandedHeight));
        const modelW = roundToNearestAllowedDimension(expandedWidth * scale);
        const modelH = roundToNearestAllowedDimension(expandedHeight * scale);
        const sourceWidth = Math.min(modelW - Number(horizontal), Math.max(1, Math.round(width * modelW / expandedWidth)));
        const sourceHeight = Math.min(modelH - Number(!horizontal), Math.max(1, Math.round(height * modelH / expandedHeight)));
        const left = expandDirection === "left" ? modelW - sourceWidth : 0;
        const top = expandDirection === "top" ? modelH - sourceHeight : 0;
        const resizedSource = await source.resize(sourceWidth, sourceHeight, { fit: "fill" }).ensureAlpha().png().toBuffer();
        const resizedImage = await sharp({
          create: { width: modelW, height: modelH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
        }).composite([{ input: resizedSource, left, top }]).png().toBuffer();

        const mask = Buffer.alloc(modelW * modelH, 255);
        for (let row = top; row < top + sourceHeight; row++) {
          mask.fill(0, row * modelW + left, row * modelW + left + sourceWidth);
        }
        const resizedMask = await sharp(mask, { raw: { width: modelW, height: modelH, channels: 1 } }).png().toBuffer();
        return { resizedImage, resizedMask, modelW, modelH };
      });

      const ts = Date.now();
      const imageUploaded = await uploadToCloudinary(
        resizedImage,
        `${image.filename.replace(/\.[^/.]+$/, "")}_genfill_src_${ts}.png`,
      );
      const maskUploaded = await uploadToCloudinary(
        resizedMask,
        `${image.filename.replace(/\.[^/.]+$/, "")}_genfill_mask_${ts}.png`,
      );

      const output = await replicate.run(
        REPLICATE_MODEL as `${string}/${string}:${string}`,
        {
          input: {
            image: imageUploaded.secureUrl,
            mask: maskUploaded.secureUrl,
            prompt: trimmedPrompt,
            width: modelW,
            height: modelH,
            num_inference_steps: 30,
            num_outputs: 1,
          },
        },
      );

      const resultUrl = extractOutputUrl(output);

      const { buffer: resultBuffer } = await fetchReplicateDeliveryBuffer(resultUrl);

      const uploaded = await uploadToCloudinary(
        resultBuffer,
        `${image.filename.replace(/\.[^/.]+$/, "")}_genfill.png`,
      );

      await prisma.imageVersion.create({
        data: {
          imageId: image.id,
          url: uploaded.secureUrl,
          publicId: uploaded.publicId,
          adjustments: { operationResult: true },
          label: "Generative Fill",
        },
      });

      return NextResponse.json({ resultUrl: uploaded.secureUrl });
    } catch (innerErr) {
      await refundCreditFeature({
        userId: user.id,
        feature: "generative_fill",
        description: "Refund: generative fill failed",
      });
      return apiInternalErrorResponse("/api/ai/generative-fill", innerErr, "Generative fill failed");
    }
  } catch (outerErr) {
    return apiInternalErrorResponse("/api/ai/generative-fill", outerErr);
  }
}
