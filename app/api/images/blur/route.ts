import { NextResponse } from "next/server";
import sharp from "sharp";
import { uploadToCloudinary } from "@/lib/cloudinary";
import { prisma } from "@/lib/prisma";
import { apiInternalErrorResponse } from "@/lib/api-error";
import { requireAuthUser } from "@/lib/require-user";
import { blurImageBodySchema, parseJsonRequest } from "@/lib/api-validation";

// blurIntensity 1–100 maps sigma to ~1–30 for Sharp's Gaussian blur
function intensityToSigma(intensity: number): number {
  const clamped = Math.max(1, Math.min(100, intensity));
  return 1 + (clamped / 100) * 29;
}

const CLOUDINARY_MAX_BYTES = 9 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const authResult = await requireAuthUser();
    if ("error" in authResult) {
      return authResult.error;
    }
    const { user } = authResult;

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
      const imageRes = await fetch(imageUrl);
      if (!imageRes.ok) {
        throw new Error(`Failed to fetch source image: ${imageRes.status} ${imageRes.statusText}`);
      }
      const sourceBuffer = Buffer.from(await imageRes.arrayBuffer());
      const meta = await sharp(sourceBuffer).metadata();
      const width = meta.width ?? 512;
      const height = meta.height ?? 512;

      const sigma = intensityToSigma(blurIntensity);

      // Blur the full image
      const blurredBuffer = await sharp(sourceBuffer)
        .blur(sigma)
        .png()
        .toBuffer();

      // Resize mask to match source
      const maskBuffer = Buffer.from(maskBase64, "base64");
      const maskResized = await sharp(maskBuffer)
        .resize(width, height, { fit: "fill" })
        .grayscale()
        .raw()
        .toBuffer({ resolveWithObject: true });

      // Get the blurred image as raw RGBA pixels
      const blurredRGBA = await sharp(blurredBuffer)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      // Replace blurred image's alpha channel with the mask values
      // so only painted (white) areas remain visible in the blurred layer
      const { data: blurData, info } = blurredRGBA;
      const { data: maskData } = maskResized;
      for (let i = 0; i < info.width * info.height; i++) {
        (blurData as Buffer)[i * 4 + 3] = (maskData as Buffer)[i];
      }

      // Reconstruct the masked-blurred layer as PNG
      const maskedBlurred = await sharp(blurData as Buffer, {
        raw: { width: info.width, height: info.height, channels: 4 },
      })
        .png()
        .toBuffer();

      // Composite the masked blur over the original — only painted areas are blurred
      const resultBuffer = await sharp(sourceBuffer)
        .composite([{ input: maskedBlurred, blend: "over" }])
        .png()
        .toBuffer();

      // Adaptive JPEG quality loop — guarantees under 9MB for any image size
      let outputBuffer: Buffer;
      let quality = 92;
      do {
        outputBuffer = await sharp(resultBuffer)
          .jpeg({ quality })
          .toBuffer();
        quality -= 10;
      } while (outputBuffer.length > CLOUDINARY_MAX_BYTES && quality > 20);

      const uploaded = await uploadToCloudinary(
        outputBuffer,
        `${image.filename.replace(/\.[^/.]+$/, "")}_blur.jpeg`,
      );

      await prisma.imageVersion.create({
        data: {
          imageId,
          url: uploaded.secureUrl,
          publicId: uploaded.publicId,
          adjustments: {},
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
