import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import Replicate from "replicate";
import sharp from "sharp";
import { uploadToCloudinary } from "@/lib/cloudinary";
import { prisma } from "@/lib/prisma";

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

// LaMa inpainting — context-aware object removal, no generative hallucination.
// Model: zylim0702/remove-object (LaMa, same algorithm as andreasjansson/lama-inpainting which no longer exists on Replicate)
// Latest version confirmed 2023-07-04 — check https://replicate.com/zylim0702/remove-object if this breaks.
const REPLICATE_MODEL =
  "zylim0702/remove-object:0e3a841c913f597c1e4c321560aa69e2bc1f15c65f8c366caafc379240efd8ba";

/** LaMa only accepts these side lengths (same constraint as SD inpainting). */
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

interface RequestBody {
  imageUrl: string;
  maskBase64: string;
  imageId: string;
}

export async function POST(request: Request) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({ where: { clerkId } });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const body = (await request.json()) as RequestBody;
    const { imageUrl, maskBase64, imageId } = body;

    if (!imageUrl || !maskBase64 || !imageId) {
      return NextResponse.json(
        { error: "imageUrl, maskBase64, and imageId are required" },
        { status: 400 },
      );
    }

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
      const sourceImageBuffer = Buffer.from(await imageRes.arrayBuffer());
      const imageMeta = await sharp(sourceImageBuffer).metadata();
      const iw = imageMeta.width ?? 512;
      const ih = imageMeta.height ?? 512;
      const originalWidth = iw;
      const originalHeight = ih;
      const width = roundUpToAllowedDimension(iw);
      const height = roundUpToAllowedDimension(ih);

      // LaMa requires image and mask to be the exact same dimensions
      const imageResized = await sharp(sourceImageBuffer)
        .resize(width, height, { fit: "fill" })
        .jpeg({ quality: 90 })
        .toBuffer();

      const imageUploaded = await uploadToCloudinary(
        imageResized,
        `erase_input_${imageId}_${Date.now()}.jpeg`,
      );

      const maskBuffer = Buffer.from(maskBase64, "base64");
      const maskResized = await sharp(maskBuffer)
        .resize(width, height, { fit: "fill" })
        .png({ compressionLevel: 9 })
        .toBuffer();

      const maskUploaded = await uploadToCloudinary(
        maskResized,
        `erase_mask_${imageId}_${Date.now()}.png`,
      );

      const output = await replicate.run(
        REPLICATE_MODEL as `${string}/${string}:${string}`,
        {
          input: {
            image: imageUploaded.secureUrl,
            mask: maskUploaded.secureUrl,
            // LaMa fills from context — no text prompt needed
          },
        },
      );

      const resultUrl = extractOutputUrl(output);

      const resultRes = await fetch(resultUrl);
      if (!resultRes.ok) {
        throw new Error(`Failed to download erase result: ${resultRes.status}`);
      }
      const resultBuffer = Buffer.from(await resultRes.arrayBuffer());

      // Scale result back to original dimensions; adaptive JPEG quality ensures < 9MB for any resolution
      const CLOUDINARY_MAX_BYTES = 9 * 1024 * 1024;
      let restoredBuffer: Buffer;
      let quality = 92;
      do {
        restoredBuffer = await sharp(resultBuffer)
          .resize(originalWidth, originalHeight, { fit: "fill" })
          .jpeg({ quality })
          .toBuffer();
        quality -= 10;
      } while (restoredBuffer.length > CLOUDINARY_MAX_BYTES && quality > 20);

      const uploaded = await uploadToCloudinary(
        restoredBuffer,
        `${image.filename.replace(/\.[^/.]+$/, "")}_erase.jpeg`,
      );

      await prisma.imageVersion.create({
        data: {
          imageId,
          url: uploaded.secureUrl,
          publicId: uploaded.publicId,
          adjustments: {},
          label: "Eraser",
        },
      });

      return NextResponse.json({ resultUrl: uploaded.secureUrl });
    } catch (innerErr) {
      console.error("[/api/images/erase]", innerErr);
      const message = innerErr instanceof Error ? innerErr.message : String(innerErr);
      return NextResponse.json(
        { error: "Erase failed", detail: message },
        { status: 500 },
      );
    }
  } catch (outerErr) {
    console.error("[/api/images/erase] Unexpected error:", outerErr);
    const message = outerErr instanceof Error ? outerErr.message : String(outerErr);
    return NextResponse.json(
      { error: "Internal server error", detail: message },
      { status: 500 },
    );
  }
}
