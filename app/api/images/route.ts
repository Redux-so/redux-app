import { type NextRequest, NextResponse } from "next/server";
import { ACTIVE_IMAGE_WHERE } from "@/lib/image-query";
import { listUserImages } from "@/lib/list-user-images";
import { prisma } from "@/lib/prisma";
import { enforceFeatureRateLimits } from "@/lib/expensive-route-guard";
import { requireAuthUser } from "@/lib/require-user";
import { scheduleImageEmbeddingAfterResponse } from "@/lib/schedule-image-embedding";
import { deleteImageBodySchema, parseJsonRequest } from "@/lib/api-validation";
import { storeLibraryUpload } from "@/lib/store-library-upload";
import { imageStorageErrorBody } from "@/lib/image-storage";
import { parseImageUploadFormData } from "@/lib/image-upload";
import { LIBRARY_PAGE_SIZE } from "@/constants/library-pagination";

/** Replicate CLIP + pgvector write run in `after()`; needs headroom on serverless. */
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const authResult = await requireAuthUser();
  if ("error" in authResult) {
    return authResult.error;
  }
  const { user } = authResult;

  const { searchParams } = new URL(request.url);
  const trash = searchParams.get("trash") === "1";
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const limit = parseInt(searchParams.get("limit") ?? String(LIBRARY_PAGE_SIZE), 10);

  const result = await listUserImages({
    userId: user.id,
    trash,
    page,
    limit,
  });

  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  const started = performance.now();
  const authResult = await requireAuthUser({ refreshProfile: false });
  if ("error" in authResult) {
    return authResult.error;
  }
  const { user } = authResult;
  const authenticated = performance.now();

  const [rateLimited, formData] = await Promise.all([
    enforceFeatureRateLimits(user.id, "image_upload"),
    request.formData(),
  ]);
  if (rateLimited) {
    return rateLimited;
  }

  const parsed = await parseImageUploadFormData(formData);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }
  const { buffer, name, size, mimeType } = parsed;
  const validated = performance.now();

  let secureUrl: string;
  let publicId: string;
  let width: number;
  let height: number;
  let format: string;
  let cover: Awaited<ReturnType<typeof storeLibraryUpload>>["cover"] = null;
  try {
    ({ secureUrl, publicId, width, height, format, cover } = await storeLibraryUpload(buffer, name, mimeType));
  } catch (err) {
    console.error("[POST /api/images] Cloudinary upload failed:", err);
    const storageError = imageStorageErrorBody(err);
    if (storageError) return NextResponse.json(storageError, { status: storageError.retryable ? 503 : 413 });
    return NextResponse.json({ error: "Failed to store image" }, { status: 502 });
  }
  const stored = performance.now();

  const image = await prisma.image.create({
    data: {
      userId: user.id,
      filename: name,
      originalUrl: secureUrl,
      publicId,
      utKey: null,
      width,
      height,
      size,
      format,
      ...(cover ? { previewUrl: cover.secureUrl, metadata: { uploadCoverPublicId: cover.publicId } } : {}),
    },
  });

  scheduleImageEmbeddingAfterResponse(
    "POST /api/images",
    image.id,
    image.originalUrl,
    user.id,
  );

  return NextResponse.json({ image }, { headers: {
    "Server-Timing": `auth;dur=${(authenticated - started).toFixed(1)}, validation;dur=${(validated - authenticated).toFixed(1)}, storage;dur=${(stored - validated).toFixed(1)}, database;dur=${(performance.now() - stored).toFixed(1)}`,
  } });
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
