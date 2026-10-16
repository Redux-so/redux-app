import { type NextRequest, NextResponse } from "next/server";
import { ACTIVE_IMAGE_WHERE } from "@/lib/image-query";
import { listUserImages } from "@/lib/list-user-images";
import { prisma } from "@/lib/prisma";
import { enforceFeatureRateLimits } from "@/lib/expensive-route-guard";
import { requireAuthUser } from "@/lib/require-user";
import { generateAndPersistImageEmbedding } from "@/lib/image-vector-pipeline";
import {
  createImageBodySchema,
  deleteImageBodySchema,
  parseJsonRequest,
} from "@/lib/api-validation";
import { SafeFetchError, fetchTrustedMediaBuffer } from "@/lib/safe-remote-fetch";
import { verifyUserUploadThingFile } from "@/lib/uploadthing-ownership";
import { LIBRARY_PAGE_SIZE } from "@/constants/library-pagination";

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
  const authResult = await requireAuthUser();
  if ("error" in authResult) {
    return authResult.error;
  }
  const { user } = authResult;

  const rateLimited = await enforceFeatureRateLimits(user.id, "image_upload");
  if (rateLimited) {
    return rateLimited;
  }

  const parsed = await parseJsonRequest(request, createImageBodySchema);
  if (!parsed.ok) {
    return parsed.response;
  }
  const { ufsUrl, name, size, utKey: clientUtKey } = parsed.data;

  const ownership = await verifyUserUploadThingFile(user.id, ufsUrl, clientUtKey);
  if (!ownership.ok) {
    const status =
      ownership.reason === "missing_token"
        ? 503
        : ownership.reason === "not_owned"
          ? 403
          : 400;
    const message =
      ownership.reason === "missing_token"
        ? "Upload verification is unavailable"
        : ownership.reason === "not_owned"
          ? "Upload is not owned by this account"
          : "Invalid or unverified upload";
    return NextResponse.json({ error: message }, { status });
  }

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
      utKey: ownership.fileKey,
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
