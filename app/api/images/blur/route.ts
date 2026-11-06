import { NextResponse } from "next/server";
import sharp from "sharp";
import { prepareRetouchImage, compositeRetouch, RetouchMaskError } from "@/lib/retouch-image";
import { uploadToCloudinary } from "@/lib/cloudinary";
import { prisma } from "@/lib/prisma";
import { apiInternalErrorResponse } from "@/lib/api-error";
import { enforceFeatureRateLimits } from "@/lib/expensive-route-guard";
import { requireAuthUser } from "@/lib/require-user";
import { blurImageBodySchema, parseJsonRequest } from "@/lib/api-validation";
import { withTrustedEditorImage } from "@/lib/safe-remote-fetch";

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
      const selection = await withTrustedEditorImage(imageUrl, (path) => prepareRetouchImage(path, maskBase64));
      const sigma = intensityToSigma(blurIntensity);
      const padding = Math.ceil(sigma * 4);
      const { left, top, width, height } = selection.selection;
      const regionLeft = Math.max(0, left - padding);
      const regionTop = Math.max(0, top - padding);
      const region = {
        left: regionLeft, top: regionTop,
        width: Math.min(selection.width, left + width + padding) - regionLeft,
        height: Math.min(selection.height, top + height + padding) - regionTop,
      };
      const blurred = await sharp(selection.pixels, {
        raw: { width: selection.width, height: selection.height, channels: 4 },
      }).extract(region).blur(sigma).png().toBuffer();
      const outputBuffer = await compositeRetouch(selection, blurred, region);

      const uploaded = await uploadToCloudinary(
        outputBuffer,
        `${image.filename.replace(/\.[^/.]+$/, "")}_blur.png`,
        { preserveOriginal: true },
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
      if (innerErr instanceof RetouchMaskError) return NextResponse.json({ error: innerErr.message }, { status: 400 });
      return apiInternalErrorResponse("/api/images/blur", innerErr, "Blur failed");
    }
  } catch (outerErr) {
    return apiInternalErrorResponse("/api/images/blur", outerErr);
  }
}
