import { auth } from "@clerk/nextjs/server";
import { type NextRequest, NextResponse } from "next/server";
import { renderAdjustedImage } from "@/lib/apply-image-adjustments";
import type { ImageTransform } from "@/lib/image-transform";
import { uploadToCloudinary } from "@/lib/cloudinary";
import { prisma } from "@/lib/prisma";
import { resolvePreviewSourceUrl } from "@/lib/resolve-preview-source";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ imageId: string }> },
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { imageId } = await params;

  const user = await prisma.user.findUnique({ where: { clerkId } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const image = await prisma.image.findFirst({
    where: { id: imageId, userId: user.id },
  });
  if (!image) {
    return NextResponse.json({ error: "Image not found" }, { status: 404 });
  }

  const body = (await request.json()) as {
    adjustments?: Record<string, number>;
    imageUrl?: string;
    imageBase64?: string;
    transform?: ImageTransform;
  };
  const { adjustments = {}, imageUrl, imageBase64, transform } = body;

  let inputBuffer: Buffer;
  try {
    const source = resolvePreviewSourceUrl({
      imageUrl,
      originalUrl: image.originalUrl,
      storedPreviewUrl: image.previewUrl,
      imageBase64,
    });

    if (source.kind === "base64") {
      inputBuffer = Buffer.from(source.base64, "base64");
    } else {
      const imgResponse = await fetch(source.url);
      if (!imgResponse.ok) {
        return NextResponse.json(
          { error: "Failed to fetch image" },
          { status: 502 },
        );
      }
      inputBuffer = Buffer.from(await imgResponse.arrayBuffer());
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid image source";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const previewBuffer = await renderAdjustedImage(inputBuffer, {
      adjustments,
      format: "jpeg",
      quality: 80,
      maxWidth: 512,
      transform,
    });

    const uploaded = await uploadToCloudinary(
      previewBuffer,
      `preview_${imageId}_${Date.now()}.jpeg`,
    );

    await prisma.image.update({
      where: { id: imageId },
      data: { previewUrl: uploaded.secureUrl },
    });

    return NextResponse.json({ previewUrl: uploaded.secureUrl });
  } catch (err) {
    console.error("[generate-preview] Error:", err);
    return NextResponse.json(
      { error: "Failed to generate preview" },
      { status: 500 },
    );
  }
}
