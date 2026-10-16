import { cloudinaryPublicIdFromDeliveryUrl } from "@/lib/cloudinary-public-id";
import { parseVersionAdjustments } from "@/lib/editor-state";
import { prisma } from "@/lib/prisma";

export interface ImageRemoteAssets {
  cloudinaryPublicIds: string[];
  utKey: string | null;
}

function addCloudinaryUrl(publicIds: Set<string>, url: string | null | undefined) {
  if (!url) return;
  const publicId = cloudinaryPublicIdFromDeliveryUrl(url);
  if (publicId) {
    publicIds.add(publicId);
  }
}

/** Collect Cloudinary public IDs and UploadThing key for one user-owned image. */
export async function collectImageRemoteAssets(
  imageId: string,
  userId: string,
): Promise<ImageRemoteAssets | null> {
  const image = await prisma.image.findFirst({
    where: { id: imageId, userId },
    select: {
      publicId: true,
      previewUrl: true,
      utKey: true,
    },
  });

  if (!image) {
    return null;
  }

  const versions = await prisma.imageVersion.findMany({
    where: { imageId, image: { userId } },
    select: {
      publicId: true,
      url: true,
      adjustments: true,
    },
  });

  const publicIds = new Set<string>();
  publicIds.add(image.publicId);
  addCloudinaryUrl(publicIds, image.previewUrl);

  for (const version of versions) {
    if (version.publicId) {
      publicIds.add(version.publicId);
    }
    addCloudinaryUrl(publicIds, version.url);
    const editorState = parseVersionAdjustments(version.adjustments);
    addCloudinaryUrl(publicIds, editorState.workingImageUrl);
  }

  return {
    cloudinaryPublicIds: [...publicIds],
    utKey: image.utKey,
  };
}
