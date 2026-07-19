import { auth } from "@clerk/nextjs/server";
import { type NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { ACTIVE_IMAGE_WHERE, TRASHED_IMAGE_WHERE } from "@/lib/image-query";
import { isImageFavorite, mergeImageMetadata } from "@/lib/image-metadata";
import { permanentlyDeleteImageById } from "@/lib/permanently-delete-image";
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
    where: { id: imageId, userId: user.id, ...ACTIVE_IMAGE_WHERE },
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
    restore?: boolean;
  };
  const { previewUrl, isFavorite, restore } = body;

  if (previewUrl === undefined && isFavorite === undefined && restore !== true) {
    return NextResponse.json(
      { error: "previewUrl, isFavorite, or restore is required" },
      { status: 400 },
    );
  }

  if (restore === true) {
    const trashed = await prisma.image.findFirst({
      where: { id: imageId, userId: user.id, ...TRASHED_IMAGE_WHERE },
      select: { id: true },
    });
    if (!trashed) {
      return NextResponse.json({ error: "Image not found in trash" }, { status: 404 });
    }

    await prisma.image.update({
      where: { id: imageId },
      data: { deletedAt: null },
    });

    return NextResponse.json({ success: true, restored: true });
  }

  const image = await prisma.image.findFirst({
    where: { id: imageId, userId: user.id, ...ACTIVE_IMAGE_WHERE },
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

/** Permanent delete — only allowed for trashed photos. */
export async function DELETE(
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
    where: { id: imageId, userId: user.id, ...TRASHED_IMAGE_WHERE },
    select: { id: true },
  });
  if (!image) {
    return NextResponse.json({ error: "Image not found in trash" }, { status: 404 });
  }

  const deleted = await permanentlyDeleteImageById(imageId, user.id);
  if (!deleted) {
    return NextResponse.json({ error: "Could not delete image" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
