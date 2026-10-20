import type { Prisma } from "@prisma/client";
import { AUTOSAVE_VERSION_LABEL } from "@/lib/autosave-version";
import { hasNonDefaultAdjustments } from "@/lib/library-filters";
import { ACTIVE_IMAGE_WHERE, TRASHED_IMAGE_WHERE } from "@/lib/image-query";
import { isImageFavorite } from "@/lib/image-metadata";
import { prisma } from "@/lib/prisma";
import type { ImageRecord } from "@/types/image";
import { LIBRARY_PAGE_SIZE } from "@/constants/library-pagination";

const IMAGE_SELECT = {
  id: true,
  filename: true,
  originalUrl: true,
  previewUrl: true,
  publicId: true,
  utKey: true,
  width: true,
  height: true,
  size: true,
  format: true,
  createdAt: true,
  deletedAt: true,
  userId: true,
  metadata: true,
  versions: {
    where: { OR: [{ label: AUTOSAVE_VERSION_LABEL }, { label: null }] },
    orderBy: { createdAt: "desc" as const },
    take: 1,
    select: { adjustments: true },
  },
} satisfies Prisma.ImageSelect;

type ImageListRow = {
  id: string;
  filename: string;
  originalUrl: string;
  previewUrl: string | null;
  publicId: string;
  utKey: string | null;
  width: number;
  height: number;
  size: number;
  format: string;
  createdAt: Date;
  deletedAt: Date | null;
  userId: string;
  metadata: unknown;
  versions: { adjustments: unknown }[];
};

export function mapImageRowToRecord({
  versions,
  metadata,
  createdAt,
  deletedAt,
  ...image
}: ImageListRow): ImageRecord {
  return {
    ...image,
    createdAt: createdAt.toISOString(),
    deletedAt: deletedAt?.toISOString() ?? null,
    isEdited: versions[0]
      ? hasNonDefaultAdjustments(versions[0].adjustments)
      : false,
    isFavorite: isImageFavorite(metadata),
  };
}

export interface ListUserImagesParams {
  userId: string;
  trash?: boolean;
  page?: number;
  limit?: number;
}

export interface ListUserImagesResult {
  images: ImageRecord[];
  total: number;
  page: number;
  limit: number;
}

export async function listUserImages({
  userId,
  trash = false,
  page = 1,
  limit = LIBRARY_PAGE_SIZE,
}: ListUserImagesParams): Promise<ListUserImagesResult> {
  const safePage = Math.max(1, page);
  const safeLimit = Math.min(100, Math.max(1, limit));
  const skip = (safePage - 1) * safeLimit;

  const where = {
    userId,
    ...(trash ? TRASHED_IMAGE_WHERE : ACTIVE_IMAGE_WHERE),
  };

  const [imagesRaw, total] = await Promise.all([
    prisma.image.findMany({
      where,
      orderBy: trash ? { deletedAt: "desc" } : { createdAt: "desc" },
      skip,
      take: safeLimit,
      select: IMAGE_SELECT,
    }),
    prisma.image.count({ where }),
  ]);

  return {
    images: imagesRaw.map(mapImageRowToRecord),
    total,
    page: safePage,
    limit: safeLimit,
  };
}
