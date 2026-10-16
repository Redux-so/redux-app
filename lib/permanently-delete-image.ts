import { UTApi } from "uploadthing/server";
import { collectImageRemoteAssets } from "@/lib/collect-image-remote-assets";
import { deleteFromCloudinary } from "@/lib/cloudinary";
import { prisma } from "@/lib/prisma";

const utapi = new UTApi({ token: process.env.UPLOADTHING_TOKEN });

interface ImageDeleteTarget {
  id: string;
  userId: string;
}

export async function permanentlyDeleteImages(
  images: ImageDeleteTarget[],
): Promise<void> {
  if (images.length === 0) return;

  const userId = images[0]!.userId;

  const assetSets = await Promise.all(
    images.map((image) => collectImageRemoteAssets(image.id, image.userId)),
  );

  const cloudinaryPublicIds = new Set<string>();
  const utKeys: string[] = [];

  for (const assets of assetSets) {
    if (!assets) continue;
    for (const publicId of assets.cloudinaryPublicIds) {
      cloudinaryPublicIds.add(publicId);
    }
    if (assets.utKey) {
      utKeys.push(assets.utKey);
    }
  }

  await Promise.allSettled(
    [...cloudinaryPublicIds].map((publicId) => deleteFromCloudinary(publicId)),
  );

  if (utKeys.length > 0) {
    await utapi.deleteFiles(utKeys);
  }

  const imageIds = images.map((image) => image.id);

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
    select: { id: true, userId: true },
  });
  if (!image) return false;

  await permanentlyDeleteImages([image]);
  return true;
}
