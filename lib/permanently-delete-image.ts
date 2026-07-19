import { UTApi } from "uploadthing/server";
import { deleteFromCloudinary } from "@/lib/cloudinary";
import { prisma } from "@/lib/prisma";

const utapi = new UTApi({ token: process.env.UPLOADTHING_TOKEN });

interface ImageDeleteTarget {
  id: string;
  publicId: string;
  utKey: string | null;
  userId: string;
}

export async function permanentlyDeleteImages(
  images: ImageDeleteTarget[],
): Promise<void> {
  if (images.length === 0) return;

  await Promise.allSettled(
    images.map((image) => deleteFromCloudinary(image.publicId)),
  );

  const utKeys = images
    .map((image) => image.utKey)
    .filter((key): key is string => key !== null);
  if (utKeys.length > 0) {
    await utapi.deleteFiles(utKeys);
  }

  const imageIds = images.map((image) => image.id);
  const userId = images[0]!.userId;

  await prisma.imageVersion.deleteMany({
    where: { imageId: { in: imageIds }, image: { userId } },
  });
  await prisma.image.deleteMany({
    where: { id: { in: imageIds }, userId },
  });
}

export async function permanentlyDeleteImageById(
  imageId: string,
  userId: string,
): Promise<boolean> {
  const image = await prisma.image.findFirst({
    where: { id: imageId, userId },
    select: { id: true, publicId: true, utKey: true, userId: true },
  });
  if (!image) return false;

  await permanentlyDeleteImages([image]);
  return true;
}
