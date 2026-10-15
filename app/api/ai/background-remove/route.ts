import { NextResponse } from "next/server";
import Replicate from "replicate";
import { uploadToCloudinary } from "@/lib/cloudinary";
import { prisma } from "@/lib/prisma";
import { apiInternalErrorResponse } from "@/lib/api-error";
import { requireAuthUser } from "@/lib/require-user";
import {
  checkRateLimit,
  checkRateLimitPerMinute,
  RATE_LIMIT_MINUTE,
} from "@/lib/kv";
import { imageUrlAndIdBodySchema, parseJsonRequest } from "@/lib/api-validation";
import { fetchReplicateDeliveryBuffer } from "@/lib/safe-remote-fetch";

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

// Full identifier passed to replicate.run() — owner/model:version
const REPLICATE_MODEL =
  "851-labs/background-removal:a029dff38972b5fda4ec5d75d7d1cd25aeff621d2cf4946a41055d7db66b80bc";

export async function POST(request: Request) {
  try {
    // ── Auth ────────────────────────────────────────────────────────────────
    const authResult = await requireAuthUser();
    if ("error" in authResult) {
      return authResult.error;
    }
    const { user } = authResult;

    // ── User ────────────────────────────────────────────────────────────────
      if (user.creditBalance < 1) {
      return NextResponse.json({ error: "Insufficient credits" }, { status: 402 });
    }

    const minuteLimit = await checkRateLimitPerMinute(
      user.id,
      "background_remove",
      RATE_LIMIT_MINUTE.background_remove,
    );
    if (!minuteLimit.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please slow down." },
        { status: 429 },
      );
    }

    const rateLimit = await checkRateLimit(user.id, "background_remove", 20);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please slow down." },
        { status: 429 },
      );
    }

    // ── Body ────────────────────────────────────────────────────────────────
    const parsed = await parseJsonRequest(request, imageUrlAndIdBodySchema);
    if (!parsed.ok) {
      return parsed.response;
    }
    const { imageUrl, imageId } = parsed.data;

    // ── Verify image ownership ──────────────────────────────────────────────
    const image = await prisma.image.findFirst({
      where: { id: imageId, userId: user.id },
    });
    if (!image) {
      return NextResponse.json({ error: "Image not found" }, { status: 404 });
    }

    // ── Deduct credit upfront ───────────────────────────────────────────────
    await prisma.user.update({
      where: { id: user.id },
      data: { creditBalance: { decrement: 1 } },
    });
    await prisma.creditTransaction.create({
      data: {
        userId: user.id,
        type: "DEDUCTION",
        amount: -1,
        feature: "remove_background",
      },
    });

    try {
      // ── Call Replicate ────────────────────────────────────────────────────
      const output = await replicate.run(
        REPLICATE_MODEL as `${string}/${string}:${string}`,
        { input: { image: imageUrl } },
      );

      // The model returns a FileOutput object (SDK v1) or a URL string.
      // FileOutput has a .url() method returning a URL; fall back to string coercion.
      let resultUrl: string;
      if (typeof output === "string") {
        resultUrl = output;
      } else if (output && typeof (output as Record<string, unknown>).url === "function") {
        resultUrl = ((output as Record<string, unknown>).url as () => URL)().href;
      } else if (Array.isArray(output) && output.length > 0) {
        const first = output[0] as unknown;
        resultUrl =
          first && typeof (first as Record<string, unknown>).url === "function"
            ? ((first as Record<string, unknown>).url as () => URL)().href
            : String(first);
      } else {
        throw new Error(`Unexpected Replicate output shape: ${String(output)}`);
      }

      // ── Download result PNG ───────────────────────────────────────────────
      const { buffer } = await fetchReplicateDeliveryBuffer(resultUrl);

      // ── Upload to Cloudinary ──────────────────────────────────────────────
      const uploaded = await uploadToCloudinary(
        buffer,
        `${image.filename.replace(/\.[^/.]+$/, "")}_no_bg.png`,
      );

      // ── Save ImageVersion ─────────────────────────────────────────────────
      await prisma.imageVersion.create({
        data: {
          imageId,
          url: uploaded.secureUrl,
          publicId: uploaded.publicId,
          adjustments: {},
          label: "Background Removed",
        },
      });

      return NextResponse.json({ resultUrl: uploaded.secureUrl });

    } catch (innerErr) {
      // ── Refund credit on processing failure ───────────────────────────────
      await prisma.user.update({
        where: { id: user.id },
        data: { creditBalance: { increment: 1 } },
      });
      await prisma.creditTransaction.create({
        data: {
          userId: user.id,
          type: "REFUND",
          amount: 1,
          feature: "remove_background",
          description: "Refund: background removal failed",
        },
      });

      return apiInternalErrorResponse(
        "/api/ai/background-remove",
        innerErr,
        "Background removal failed",
      );
    }

  } catch (outerErr) {
    return apiInternalErrorResponse("/api/ai/background-remove", outerErr);
  }
}
