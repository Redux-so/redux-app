import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuthUser } from "@/lib/require-user";
import { albumNameBodySchema, parseJsonRequest } from "@/lib/api-validation";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ albumId: string }> },
) {
  const authResult = await requireAuthUser();
  if ("error" in authResult) return authResult.error;

  const parsed = await parseJsonRequest(request, albumNameBodySchema);
  if (!parsed.ok) return parsed.response;

  const { albumId } = await params;
  const { name } = parsed.data;
  const result = await prisma.album.updateMany({
    where: { id: albumId, userId: authResult.user.id },
    data: { name },
  });
  if (result.count === 0) {
    return NextResponse.json({ error: "Album not found" }, { status: 404 });
  }
  return NextResponse.json({ album: { id: albumId, name } });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ albumId: string }> },
) {
  const authResult = await requireAuthUser();
  if ("error" in authResult) {
    return authResult.error;
  }
  const { user } = authResult;

  const { albumId } = await params;

  const album = await prisma.album.findFirst({
    where: { id: albumId, userId: user.id },
    select: { id: true },
  });
  if (!album) {
    return NextResponse.json({ error: "Album not found" }, { status: 404 });
  }

  await prisma.album.delete({
    where: { id: albumId },
  });

  return NextResponse.json({ success: true });
}
