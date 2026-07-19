import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { TRASHED_IMAGE_WHERE } from "@/lib/image-query";
import { permanentlyDeleteImages } from "@/lib/permanently-delete-image";
import { prisma } from "@/lib/prisma";

/** Permanently delete all trashed photos for the authenticated user. */
export async function DELETE() {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { clerkId } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const images = await prisma.image.findMany({
    where: { userId: user.id, ...TRASHED_IMAGE_WHERE },
    select: { id: true, publicId: true, utKey: true, userId: true },
  });

  if (images.length === 0) {
    return NextResponse.json({ deleted: 0 });
  }

  await permanentlyDeleteImages(images);

  return NextResponse.json({ deleted: images.length });
}
