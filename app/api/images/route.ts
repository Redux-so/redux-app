import { type NextRequest, NextResponse } from "next/server";
import { hasNonDefaultAdjustments } from "@/lib/library-filters";
import { ACTIVE_IMAGE_WHERE, TRASHED_IMAGE_WHERE } from "@/lib/image-query";
import { isImageFavorite } from "@/lib/image-metadata";
import { prisma } from "@/lib/prisma";
import { requireAuthUser } from "@/lib/require-user";
import { generateAndPersistImageEmbedding } from "@/lib/image-vector-pipeline";
import {
  createImageBodySchema,
  deleteImageBodySchema,
  parseJsonRequest,
} from "@/lib/api-validation";
import { SafeFetchError, fetchTrustedMediaBuffer } from "@/lib/safe-remote-fetch";

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
    orderBy: { createdAt: "desc" as const },
    take: 1,
    select: { adjustments: true },
  },
};

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

function mapImageRow({ versions, metadata, ...image }: ImageListRow) {
  return {
    ...image,
    isEdited: versions[0]
      ? hasNonDefaultAdjustments(versions[0].adjustments)
      : false,
    isFavorite: isImageFavorite(metadata),
  };
}

export async function GET(request: NextRequest) {
  const authResult = await requireAuthUser();
  if ("error" in authResult) {
    return authResult.error;
  }
  const { user } = authResult;

  const { searchParams } = new URL(request.url);
  const trash = searchParams.get("trash") === "1";
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50")));
  const skip = (page - 1) * limit;

  const where = {
    userId: user.id,
    ...(trash ? TRASHED_IMAGE_WHERE : ACTIVE_IMAGE_WHERE),
  };

  const [imagesRaw, total] = await Promise.all([
    prisma.image.findMany({
      where,
      orderBy: trash ? { deletedAt: "desc" } : { createdAt: "desc" },
      skip,
      take: limit,
      select: IMAGE_SELECT,
    }),
    prisma.image.count({ where }),
  ]);

  const images = imagesRaw.map(mapImageRow);

  return NextResponse.json({ images, total, page, limit });
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuthUser();
  if ("error" in authResult) {
    return authResult.error;
  }
  const { user } = authResult;

  const parsed = await parseJsonRequest(request, createImageBodySchema);
  if (!parsed.ok) {
    return parsed.response;
  }
  const { ufsUrl, utKey, name, size } = parsed.data;

  let buffer: Buffer;
  try {
    const fetched = await fetchTrustedMediaBuffer(ufsUrl);
    buffer = fetched.buffer;
  } catch (err) {
    if (err instanceof SafeFetchError && err.code === "UNTRUSTED_URL") {
      return NextResponse.json({ error: "Untrusted upload URL" }, { status: 400 });
    }
    console.error("[POST /api/images] Failed to fetch upload:", err);
    return NextResponse.json({ error: "Failed to fetch upload" }, { status: 502 });
  }

  const { uploadToCloudinary } = await import("@/lib/cloudinary");
  const { secureUrl, publicId, width, height, format } = await uploadToCloudinary(buffer, name);

  const image = await prisma.image.create({
    data: {
      userId: user.id,
      filename: name,
      originalUrl: secureUrl,
      publicId,
      utKey: utKey ?? null,
      width,
      height,
      size,
      format,
    },
  });

  void generateAndPersistImageEmbedding(image.id, image.originalUrl, user.id).catch((e) => {
    console.error("[POST /api/images] Background embedding failed:", e);
  });

  return NextResponse.json({ image });
}

/** Soft-delete: move photo to trash without removing storage. */
export async function DELETE(request: NextRequest) {
  const authResult = await requireAuthUser();
  if ("error" in authResult) {
    return authResult.error;
  }
  const { user } = authResult;

  const parsed = await parseJsonRequest(request, deleteImageBodySchema);
  if (!parsed.ok) {
    return parsed.response;
  }
  const { imageId } = parsed.data;

  const image = await prisma.image.findFirst({
    where: { id: imageId, userId: user.id, ...ACTIVE_IMAGE_WHERE },
    select: { id: true },
  });
  if (!image) {
    return NextResponse.json({ error: "Image not found" }, { status: 404 });
  }

  const updated = await prisma.image.update({
    where: { id: imageId },
    data: { deletedAt: new Date() },
    select: { id: true, deletedAt: true },
  });

  return NextResponse.json({ success: true, deletedAt: updated.deletedAt });
}
