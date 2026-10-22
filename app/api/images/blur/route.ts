import { NextResponse } from "next/server";
import sharp from "sharp";
import { uploadToCloudinary } from "@/lib/cloudinary";
import { prisma } from "@/lib/prisma";
import { apiInternalErrorResponse } from "@/lib/api-error";
import { enforceFeatureRateLimits } from "@/lib/expensive-route-guard";
import { requireAuthUser } from "@/lib/require-user";
import { blurImageBodySchema, parseJsonRequest } from "@/lib/api-validation";
import { fetchTrustedMediaBuffer } from "@/lib/safe-remote-fetch";

// blurIntensity 1–100 maps sigma to ~1–30 for Sharp's Gaussian blur
function intensityToSigma(intensity: number): number {
  const clamped = Math.max(1, Math.min(100, intensity));
  return 1 + (clamped / 100) * 29;
}

export async function POST(request: Request) {
  try {
    const authResult = await requireAuthUser();
    if ("error" in authResult) {
      return authResult.error;
    }
    const { user } = authResult;

    const rateLimited = await enforceFeatureRateLimits(user.id, "blur");
    if (rateLimited) {
      return rateLimited;
    }

    const parsed = await parseJsonRequest(request, blurImageBodySchema);
    if (!parsed.ok) {
      return parsed.response;
    }
    const { imageUrl, maskBase64, imageId, blurIntensity } = parsed.data;

    const image = await prisma.image.findFirst({
      where: { id: imageId, userId: user.id },
    });
    if (!image) {
      return NextResponse.json({ error: "Image not found" }, { status: 404 });
    }

    try {
      const { buffer: sourceBuffer } = await fetchTrustedMediaBuffer(imageUrl);
      const meta = await sharp(sourceBuffer).metadata();
      const width = meta.width ?? 512;
      const height = meta.height ?? 512;

      const sigma = intensityToSigma(blurIntensity);
      const maskBuffer = Buffer.from(maskBase64, "base64");

      const [blurredRgb, maskResized] = await Promise.all([
        sharp(sourceBuffer)
          .blur(sigma)
          .removeAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true }),
        sharp(maskBuffer)
          .resize(width, height, { fit: "fill" })
          .grayscale()
          .raw()
          .toBuffer({ resolveWithObject: true }),
      ]);

      const maskedRgba = await sharp(blurredRgb.data, {
        raw: {
          width: blurredRgb.info.width,
          height: blurredRgb.info.height,
          channels: 3,
        },
      })
        .joinChannel(maskResized.data, {
          raw: {
            width: maskResized.info.width,
            height: maskResized.info.height,
            channels: 1,
          },
        })
        .raw()
        .toBuffer({ resolveWithObject: true });

      const composed = await sharp(sourceBuffer)
        .composite([
          {
            input: maskedRgba.data,
            raw: {
              width: maskedRgba.info.width,
              height: maskedRgba.info.height,
              channels: maskedRgba.info.channels,
            },
            blend: "over",
          },
        ])
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      // The shared uploader handles storage size without degrading these pixels.
      const outputBuffer = await sharp(composed.data, {
        raw: {
          width: composed.info.width,
          height: composed.info.height,
          channels: composed.info.channels,
        },
      })
        .png()
        .toBuffer();

      const uploaded = await uploadToCloudinary(
        outputBuffer,
        `${image.filename.replace(/\.[^/.]+$/, "")}_blur.png`,
      );

      await prisma.imageVersion.create({
        data: {
          imageId,
          url: uploaded.secureUrl,
          publicId: uploaded.publicId,
          adjustments: { operationResult: true },
          label: "Blur",
        },
      });

      return NextResponse.json({ resultUrl: uploaded.secureUrl });
    } catch (innerErr) {
      return apiInternalErrorResponse("/api/images/blur", innerErr, "Blur failed");
    }
  } catch (outerErr) {
    return apiInternalErrorResponse("/api/images/blur", outerErr);
  }
}
