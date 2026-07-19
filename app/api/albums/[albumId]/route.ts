import { auth } from "@clerk/nextjs/server";
import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _request: NextRequest,
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
