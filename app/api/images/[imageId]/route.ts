import { auth } from "@clerk/nextjs/server";
import { type NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { isImageFavorite, mergeImageMetadata } from "@/lib/image-metadata";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
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
    select: {
      id: true,
      filename: true,
      originalUrl: true,
      previewUrl: true,
      publicId: true,
      utKey: true,
      width: true,
      height: true,
      size: true,
      format: true,
      createdAt: true,
      userId: true,
      metadata: true,
    },
  });

  if (!image) {
    return NextResponse.json({ error: "Image not found" }, { status: 404 });
  }

  return NextResponse.json({
    image: {
      ...image,
      isFavorite: isImageFavorite(image.metadata),
    },
  });
}

export async function PATCH(
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

  const body = (await request.json()) as {
    previewUrl?: string;
    isFavorite?: boolean;
  };
  const { previewUrl, isFavorite } = body;

  if (previewUrl === undefined && isFavorite === undefined) {
    return NextResponse.json(
      { error: "previewUrl or isFavorite is required" },
      { status: 400 },
    );
  }

  const image = await prisma.image.findFirst({
    where: { id: imageId, userId: user.id },
    select: { id: true, metadata: true },
  });
  if (!image) {
    return NextResponse.json({ error: "Image not found" }, { status: 404 });
  }

  const data: {
    previewUrl?: string;
    metadata?: Prisma.InputJsonValue;
  } = {};

  if (previewUrl !== undefined) {
    data.previewUrl = previewUrl;
  }

  if (isFavorite !== undefined) {
    data.metadata = mergeImageMetadata(image.metadata, {
      favorite: isFavorite,
    }) as Prisma.InputJsonValue;
  }

  await prisma.image.update({
    where: { id: imageId },
    data,
  });

  return NextResponse.json({
    success: true,
    ...(previewUrl !== undefined ? { previewUrl } : {}),
    ...(isFavorite !== undefined ? { isFavorite } : {}),
  });
}
