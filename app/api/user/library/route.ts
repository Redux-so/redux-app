import { NextResponse } from "next/server";
import { ACTIVE_IMAGE_WHERE } from "@/lib/image-query";
import { permanentlyDeleteImages } from "@/lib/permanently-delete-image";
import { prisma } from "@/lib/prisma";
import { requireAuthUser } from "@/lib/require-user";

export async function DELETE() {
  const authResult = await requireAuthUser();
  if ("error" in authResult) {
    return authResult.error;
  }
  const { user } = authResult;

  const images = await prisma.image.findMany({
    where: { userId: user.id },
    select: { id: true, publicId: true, utKey: true, userId: true },
  });

  if (images.length === 0) {
    return NextResponse.json({ deleted: 0 });
  }

  await permanentlyDeleteImages(images);

  return NextResponse.json({ deleted: images.length });
}
