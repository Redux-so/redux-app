import { stat } from "node:fs/promises";
import { EDITOR_SOURCE_MAX_BYTES, EDITOR_SOURCE_MAX_SIZE } from "@/constants/image-upload";
import { createHash } from "node:crypto";
import type { Image } from "@prisma/client";
import sharp from "sharp";
import { createUploadthing } from "uploadthing/next";
import { UploadThingError } from "uploadthing/server";
import { z } from "zod";
import { IMAGE_UPLOAD_MAX_BYTES, IMAGE_UPLOAD_MIME_TYPES } from "@/constants/image-upload";
import { API_LIMITS } from "@/lib/api-validation";
import { deleteFromCloudinary } from "@/lib/cloudinary";
import { enforceFeatureRateLimits } from "@/lib/expensive-route-guard";
import { ALTERNATE_ASSET_PREFIX } from "@/lib/image-storage";
import { prisma } from "@/lib/prisma";
import { requireAuthUser } from "@/lib/require-user";
import { fetchTrustedMediaBuffer, withTrustedEditorImage } from "@/lib/safe-remote-fetch";
import { scheduleImageEmbeddingAfterResponse } from "@/lib/schedule-image-embedding";
import { createLibraryUploadCover } from "@/lib/store-library-upload";

const upload = createUploadthing();

function completedUpload(image: Image) {
  return {
    image: {
      id: image.id,
      userId: image.userId,
      filename: image.filename,
      originalUrl: image.originalUrl,
      previewUrl: image.previewUrl,
      publicId: image.publicId,
      utKey: image.utKey,
      width: image.width,
      height: image.height,
      size: image.size,
      format: image.format,
      createdAt: image.createdAt.toISOString(),
      deletedAt: image.deletedAt?.toISOString() ?? null,
    },
    error: null,
  };
}

async function cleanUpAsset(publicId: string) {
  await deleteFromCloudinary(publicId).catch((error) =>
    console.error("[library upload] Asset cleanup failed", error),
  );
}

export const libraryUploadRouter = {
  editorSource: upload({ image: { maxFileSize: EDITOR_SOURCE_MAX_SIZE, maxFileCount: 1 } })
    .input(z.object({ imageId: z.string().min(1).max(API_LIMITS.RESOURCE_ID_MAX_LEN) }))
    .middleware(async ({ files, input: { imageId } }) => {
      const auth = await requireAuthUser({ refreshProfile: false });
      if ("error" in auth) throw new UploadThingError({ code: "FORBIDDEN", message: "Sign in to save edits" });
      if (files.length !== 1 || files[0].type !== "image/png"
        || files[0].size <= 0 || files[0].size > EDITOR_SOURCE_MAX_BYTES) {
        throw new UploadThingError({ code: "BAD_REQUEST", message: "Edited image must be a PNG up to 128 MiB" });
      }
      const blocked = await enforceFeatureRateLimits(auth.user.id, "save_version");
      if (blocked) {
        const { error } = await blocked.json() as { error: string };
        throw new UploadThingError({ code: blocked.status === 429 ? "FORBIDDEN" : "INTERNAL_SERVER_ERROR", message: error });
      }
      const image = await prisma.image.findFirst({
        where: { id: imageId, userId: auth.user.id }, select: { id: true },
      });
      if (!image) throw new UploadThingError({ code: "NOT_FOUND", message: "Image not found" });
      return { imageId };
    })
    .onUploadComplete(async ({ file, metadata: { imageId } }) => {
      const publicId = `${ALTERNATE_ASSET_PREFIX}${file.key}`;
      const valid = await withTrustedEditorImage(file.ufsUrl, async (path) => {
        const { size } = await stat(path);
        const photo = await sharp(path).metadata().catch(() => null);
        return size === file.size && photo?.format === "png";
      });
      if (!valid) {
        await cleanUpAsset(publicId);
        return { sourceUrl: null, error: "Could not read the edited image" };
      }
      // The signed callback may be delivered more than once for the same asset.
      const id = createHash("sha256").update(publicId).digest("hex");
      await prisma.imageVersion.createMany({
        skipDuplicates: true,
        data: {
          id, imageId, publicId, url: file.ufsUrl,
          adjustments: { operationResult: true }, label: "History source",
        },
      });
      return { sourceUrl: file.ufsUrl, error: null };
    }),
  libraryPhoto: upload({ image: { maxFileSize: "32MB", maxFileCount: 1 } })
    .input(z.object({ uploadId: z.string().uuid() }))
    .middleware(async ({ files, input }) => {
      const auth = await requireAuthUser({ refreshProfile: false });
      if ("error" in auth) throw new UploadThingError({ code: "FORBIDDEN", message: "Sign in to upload photos" });

      const [file] = files;
      if (files.length !== 1 || !file || !file.name.trim() || file.name.length > API_LIMITS.UPLOAD_NAME_MAX
        || file.size <= 0 || file.size > IMAGE_UPLOAD_MAX_BYTES
        || !(IMAGE_UPLOAD_MIME_TYPES as readonly string[]).includes(file.type)) {
        throw new UploadThingError({ code: "BAD_REQUEST", message: "Choose a JPEG, PNG, or TIFF photo up to 32 MB" });
      }

      const blocked = await enforceFeatureRateLimits(auth.user.id, "image_upload");
      if (blocked) {
        const { error } = await blocked.json() as { error: string };
        throw new UploadThingError({ code: blocked.status === 429 ? "FORBIDDEN" : "INTERNAL_SERVER_ERROR", message: error });
      }

      const imageId = createHash("sha256").update(`${auth.user.id}:${input.uploadId}`).digest("hex");
      return { userId: auth.user.id, imageId };
    })
    .onUploadComplete(async ({ file, metadata: { userId, imageId } }) => {
      const publicId = `${ALTERNATE_ASSET_PREFIX}${file.key}`;
      const existing = await prisma.image.findUnique({ where: { id: imageId, userId } });
      if (existing) {
        if (existing.publicId !== publicId) await cleanUpAsset(publicId);
        return completedUpload(existing);
      }

      const { buffer } = await fetchTrustedMediaBuffer(file.ufsUrl);
      const photo = await sharp(buffer).metadata().catch(() => null);
      if (buffer.length !== file.size || buffer.length > IMAGE_UPLOAD_MAX_BYTES || !photo
        || !["jpeg", "png", "tiff"].includes(photo.format)) {
        await cleanUpAsset(publicId);
        return { image: null, error: "Could not read this JPEG, PNG, or TIFF photo" };
      }

      const cover = await createLibraryUploadCover(buffer, file.name).catch((error) => {
        console.error("[library upload] Cover unavailable", error);
        return null;
      });
      const { count } = await prisma.image.createMany({
        skipDuplicates: true,
        data: {
          id: imageId,
          userId,
          filename: file.name,
          originalUrl: file.ufsUrl,
          publicId,
          width: photo.autoOrient.width,
          height: photo.autoOrient.height,
          format: photo.format,
          size: buffer.length,
          ...(cover ? { previewUrl: cover.secureUrl, metadata: { uploadCoverPublicId: cover.publicId } } : {}),
        },
      });
      const image = await prisma.image.findUniqueOrThrow({ where: { id: imageId, userId } });
      if (count) {
        scheduleImageEmbeddingAfterResponse("library upload", imageId, image.originalUrl, userId);
      } else {
        if (image.publicId !== publicId) await cleanUpAsset(publicId);
        if (cover) await cleanUpAsset(cover.publicId);
      }
      return completedUpload(image);
    }),
};
