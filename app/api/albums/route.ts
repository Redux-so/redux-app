import { auth } from "@clerk/nextjs/server";
import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { AlbumRecord } from "@/types/album";

function serializeAlbum(album: {
  id: string;
  name: string;
  createdAt: Date;
  members: { imageId: string }[];
}): AlbumRecord {
  return {
    id: album.id,
    name: album.name,
    createdAt: album.createdAt.toISOString(),
    imageIds: album.members.map((member) => member.imageId),
  };
}

export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { clerkId } });
  if (!user) {
    return NextResponse.json({ albums: [] });
  }

  const albums = await prisma.album.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      createdAt: true,
      members: { select: { imageId: true } },
    },
  });

  return NextResponse.json({
    albums: albums.map(serializeAlbum),
  });
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

  const body = (await request.json()) as { name?: string };
  const name = body.name?.trim() ?? "";
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (name.length > 80) {
    return NextResponse.json(
      { error: "name must be at most 80 characters" },
      { status: 400 },
    );
  }

  const album = await prisma.album.create({
    data: {
      userId: user.id,
      name,
    },
    select: {
      id: true,
      name: true,
      createdAt: true,
      members: { select: { imageId: true } },
    },
  });

  return NextResponse.json({ album: serializeAlbum(album) });
}
