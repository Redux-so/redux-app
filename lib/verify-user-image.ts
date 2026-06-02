import type { Image } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Returns the user's Image row if imageUrl matches originalUrl, previewUrl,
 * or a stored version URL — otherwise null.
 */
export async function assertUserOwnsImageUrl(
  userId: string,
  imageUrl: string,
): Promise<Image | null> {
  const base = imageUrl.split("?")[0] ?? imageUrl;

  return prisma.image.findFirst({
    where: {
      userId,
      OR: [
        { originalUrl: imageUrl },
        { originalUrl: base },
        { previewUrl: imageUrl },
        { previewUrl: base },
        { versions: { some: { url: imageUrl } } },
        { versions: { some: { url: { startsWith: base } } } },
      ],
    },
  });
}
