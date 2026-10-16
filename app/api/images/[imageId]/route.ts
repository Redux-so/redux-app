import { type NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { patchImageBodySchema, parseJsonRequest } from "@/lib/api-validation";
import { ACTIVE_IMAGE_WHERE, TRASHED_IMAGE_WHERE } from "@/lib/image-query";
import { isImageFavorite, mergeImageMetadata } from "@/lib/image-metadata";
import { permanentlyDeleteImageById } from "@/lib/permanently-delete-image";
import { prisma } from "@/lib/prisma";
import { requireAuthUser } from "@/lib/require-user";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ imageId: string }> },
) {
  const authResult = await requireAuthUser();
  if ("error" in authResult) {
    return authResult.error;
  }
  const { user } = authResult;

  const { imageId } = await params;

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
  const authResult = await requireAuthUser();
  if ("error" in authResult) {
    return authResult.error;
  }
  const { user } = authResult;

  const { imageId } = await params;

  const parsed = await parseJsonRequest(request, patchImageBodySchema);
  if (!parsed.ok) {
    return parsed.response;
  }
  const { isFavorite, restore } = parsed.data;

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
    metadata?: Prisma.InputJsonValue;
  } = {};

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
    ...(isFavorite !== undefined ? { isFavorite } : {}),
  });
}

/** Permanent delete — only allowed for trashed photos. */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ imageId: string }> },
) {
  const authResult = await requireAuthUser();
  if ("error" in authResult) {
    return authResult.error;
  }
  const { user } = authResult;

  const { imageId } = await params;

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
