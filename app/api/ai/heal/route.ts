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
import { maskImageOperationBodySchema, parseJsonRequest } from "@/lib/api-validation";
import {
  fetchReplicateDeliveryBuffer,
  fetchTrustedMediaBuffer,
} from "@/lib/safe-remote-fetch";

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

const HEAL_COST = 2;

const REPLICATE_MODEL =
  "stability-ai/stable-diffusion-inpainting:95b7223104132402a9ae91cc677285bc5eb997834bd2349fa486f53910fd68b3";

const INPAINT_PROMPT =
  "remove object, clean background, seamless, realistic";

/** Replicate SD inpainting only accepts these side lengths. */
const ALLOWED_INPAINT_DIMS = [
  64, 128, 192, 256, 320, 384, 448, 512, 576, 640, 704, 768, 832, 896, 960, 1024,
] as const;

function roundUpToAllowedDimension(n: number): number {
  const v = Math.max(1, Math.ceil(n));
  for (const d of ALLOWED_INPAINT_DIMS) {
    if (d >= v) return d;
  }
  return 1024;
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

      if (user.creditBalance < HEAL_COST) {
      return NextResponse.json({ error: "Insufficient credits" }, { status: 402 });
    }

    const minuteLimit = await checkRateLimitPerMinute(
      user.id,
      "heal",
      RATE_LIMIT_MINUTE.heal,
    );
    if (!minuteLimit.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please slow down." },
        { status: 429 },
      );
    }

    const rateLimit = await checkRateLimit(user.id, "heal", 20);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please slow down." },
        { status: 429 },
      );
    }

    const parsed = await parseJsonRequest(request, maskImageOperationBodySchema);
    if (!parsed.ok) {
      return parsed.response;
    }
    const { imageUrl, maskBase64, imageId } = parsed.data;

    const image = await prisma.image.findFirst({
      where: { id: imageId, userId: user.id },
    });
    if (!image) {
      return NextResponse.json({ error: "Image not found" }, { status: 404 });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { creditBalance: { decrement: HEAL_COST } },
    });
    await prisma.creditTransaction.create({
      data: {
        userId: user.id,
        type: "DEDUCTION",
        amount: -HEAL_COST,
        feature: "heal",
      },
    });

    const userId = user.id;

    async function refundCredits(reason: string) {
      await prisma.user.update({
        where: { id: userId },
        data: { creditBalance: { increment: HEAL_COST } },
      });
      await prisma.creditTransaction.create({
        data: {
          userId,
          type: "REFUND",
          amount: HEAL_COST,
          feature: "heal",
          description: reason,
        },
      });
    }

    try {
      const { buffer: sourceImageBuffer } = await fetchTrustedMediaBuffer(imageUrl);
      const imageMeta = await sharp(sourceImageBuffer).metadata();
      const iw = imageMeta.width ?? 512;
      const ih = imageMeta.height ?? 512;
      const width = roundUpToAllowedDimension(iw);
      const height = roundUpToAllowedDimension(ih);

      const maskBuffer = Buffer.from(maskBase64, "base64");
      const maskResized = await sharp(maskBuffer)
        .resize(width, height, { fit: "fill" })
        .png()
        .toBuffer();

      const maskUploaded = await uploadToCloudinary(
        maskResized,
        `heal_mask_${imageId}_${Date.now()}.png`,
      );

      const output = await replicate.run(
        REPLICATE_MODEL as `${string}/${string}:${string}`,
        {
          input: {
            image: imageUrl,
            mask: maskUploaded.secureUrl,
            prompt: INPAINT_PROMPT,
            width,
            height,
            num_inference_steps: 30,
            num_outputs: 1,
          },
        },
      );

      const resultUrl = extractOutputUrl(output);

      const { buffer: resultBuffer } = await fetchReplicateDeliveryBuffer(resultUrl);

      const uploaded = await uploadToCloudinary(
        resultBuffer,
        `${image.filename.replace(/\.[^/.]+$/, "")}_heal.png`,
      );

      await prisma.imageVersion.create({
        data: {
          imageId,
          url: uploaded.secureUrl,
          publicId: uploaded.publicId,
          adjustments: {},
          label: "Heal",
        },
      });

      return NextResponse.json({ resultUrl: uploaded.secureUrl });
    } catch (innerErr) {
      await refundCredits("Refund: heal failed");
      return apiInternalErrorResponse("/api/ai/heal", innerErr, "Heal failed");
    }
  } catch (outerErr) {
    return apiInternalErrorResponse("/api/ai/heal", outerErr);
  }
}
