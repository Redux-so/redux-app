import { auth } from "@clerk/nextjs/server";
import { type NextRequest, NextResponse } from "next/server";
import { ACTIVE_IMAGE_WHERE } from "@/lib/image-query";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ albumId: string }> },
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { albumId } = await params;

  const user = await prisma.user.findUnique({ where: { clerkId } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const body = (await request.json()) as { imageId?: string };
  const { imageId } = body;
  if (!imageId) {
    return NextResponse.json({ error: "imageId is required" }, { status: 400 });
  }

  const album = await prisma.album.findFirst({
    where: { id: albumId, userId: user.id },
    select: { id: true },
  });
  if (!album) {
    return NextResponse.json({ error: "Album not found" }, { status: 404 });
  }

  const image = await prisma.image.findFirst({
    where: { id: imageId, userId: user.id, ...ACTIVE_IMAGE_WHERE },
    select: { id: true },
  });
  if (!image) {
    return NextResponse.json({ error: "Image not found" }, { status: 404 });
  }

  await prisma.albumImage.upsert({
    where: {
      albumId_imageId: { albumId, imageId },
    },
    create: { albumId, imageId },
    update: {},
  });

  return NextResponse.json({ success: true });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ albumId: string }> },
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { albumId } = await params;

  const user = await prisma.user.findUnique({ where: { clerkId } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const body = (await request.json()) as { imageId?: string };
  const { imageId } = body;
  if (!imageId) {
    return NextResponse.json({ error: "imageId is required" }, { status: 400 });
  }

  const album = await prisma.album.findFirst({
    where: { id: albumId, userId: user.id },
    select: { id: true },
  });
  if (!album) {
    return NextResponse.json({ error: "Album not found" }, { status: 404 });
  }

  await prisma.albumImage.deleteMany({
    where: { albumId, imageId, album: { userId: user.id } },
  });

  return NextResponse.json({ success: true });
}
