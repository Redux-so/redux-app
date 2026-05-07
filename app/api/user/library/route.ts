import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { UTApi } from "uploadthing/server";

const utapi = new UTApi({ token: process.env.UPLOADTHING_TOKEN });

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
    where: { userId: user.id },
    select: { id: true, publicId: true, utKey: true },
  });

  if (images.length === 0) {
    return NextResponse.json({ deleted: 0 });
  }

  const { deleteFromCloudinary } = await import("@/lib/cloudinary");

  // Delete from Cloudinary and UploadThing in parallel batches
  await Promise.allSettled(
    images.map((img) => deleteFromCloudinary(img.publicId)),
  );

  const utKeys = images.map((img) => img.utKey).filter((k): k is string => k !== null);
  if (utKeys.length > 0) {
    await utapi.deleteFiles(utKeys);
  }

  // Delete all ImageVersion rows then all Image rows for this user
  const imageIds = images.map((img) => img.id);
  await prisma.imageVersion.deleteMany({ where: { imageId: { in: imageIds } } });
  await prisma.image.deleteMany({ where: { userId: user.id } });

  return NextResponse.json({ deleted: images.length });
}
