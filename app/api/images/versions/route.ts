import { auth } from "@clerk/nextjs/server";
import { type NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { parseVersionAdjustments, serializePersistedEditorState } from "@/lib/editor-state";
import { uploadToCloudinary } from "@/lib/cloudinary";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const imageId = searchParams.get("imageId");
  if (!imageId) {
    return NextResponse.json({ error: "imageId is required" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { clerkId } });
  if (!user) {
    return NextResponse.json({ versions: [] });
  }

  // Verify the image belongs to this user before returning its versions
  const image = await prisma.image.findFirst({
    where: { id: imageId, userId: user.id },
    select: { id: true },
  });
  if (!image) {
    return NextResponse.json({ error: "Image not found" }, { status: 404 });
  }

  const versions = await prisma.imageVersion.findMany({
    where: { imageId, image: { userId: user.id } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      imageId: true,
      adjustments: true,
      label: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ versions });
}

export async function POST(request: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { clerkId } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const body = (await request.json()) as {
    imageId?: string;
    adjustments?: Record<string, unknown>;
    imageBase64?: string;
    label?: string;
  };
  const { imageId, adjustments: rawAdjustments, imageBase64, label } = body;

  if (!imageId || !rawAdjustments) {
    return NextResponse.json(
      { error: "imageId and adjustments are required" },
      { status: 400 },
    );
  }

  // Verify the image belongs to this user
  const image = await prisma.image.findFirst({
    where: { id: imageId, userId: user.id },
    select: { id: true, originalUrl: true, publicId: true },
  });
  if (!image) {
    return NextResponse.json({ error: "Image not found" }, { status: 404 });
  }

  const editorState = parseVersionAdjustments(rawAdjustments);

  if (imageBase64) {
    const buffer = Buffer.from(imageBase64, "base64");
    const uploaded = await uploadToCloudinary(
      buffer,
      `${image.publicId}-working-${Date.now()}.jpg`,
    );
    editorState.workingImageUrl = uploaded.secureUrl;
  }

  const adjustments = serializePersistedEditorState(editorState);

  const version = await prisma.imageVersion.create({
    data: {
      imageId,
      url: editorState.workingImageUrl ?? image.originalUrl,
      publicId: image.publicId,
      adjustments: adjustments as Prisma.InputJsonValue,
      label: label ?? null,
    },
  });

  return NextResponse.json({ version });
}
