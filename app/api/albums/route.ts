import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuthUser } from "@/lib/require-user";
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
  const authResult = await requireAuthUser();
  if ("error" in authResult) {
    return authResult.error;
  }
  const { user } = authResult;

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
  const authResult = await requireAuthUser();
  if ("error" in authResult) {
    return authResult.error;
  }
  const { user } = authResult;

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
