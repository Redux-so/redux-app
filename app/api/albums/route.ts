import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuthUser } from "@/lib/require-user";
import type { AlbumRecord } from "@/types/album";
import { albumNameBodySchema, parseJsonRequest } from "@/lib/api-validation";

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

  const parsed = await parseJsonRequest(request, albumNameBodySchema);
  if (!parsed.ok) {
    return parsed.response;
  }
  const { name } = parsed.data;

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
