import { randomUUID } from "node:crypto";
import { v2 as cloudinary } from "cloudinary";
import type { UploadApiResponse } from "cloudinary";
import sharp from "sharp";
import { ALTERNATE_ASSET_PREFIX, CLOUDINARY_IMAGE_MAX_BYTES, ImageStorageError, isProviderSizeError, prepareStorageImage } from "@/lib/image-storage";

cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export interface CloudinaryUploadResult {
  secureUrl: string;
  publicId: string;
  width: number;
  height: number;
  format: string;
}

export interface CloudinaryUploadOptions {
  /** Replace an existing asset at the same public_id (requires uniqueFilename: false). */
  overwrite?: boolean;
  uniqueFilename?: boolean;
  /** Original uploads keep their exact source bytes, including metadata. */
  preserveOriginal?: boolean;
}

export async function uploadToCloudinary(
  buffer: Buffer,
  filename: string,
  options: CloudinaryUploadOptions = {},
): Promise<CloudinaryUploadResult> {
  const prepared = options.preserveOriginal ? buffer : await prepareStorageImage(buffer);
  if (prepared.length > CLOUDINARY_IMAGE_MAX_BYTES) return uploadLargeImage(prepared, filename);
  try { return await uploadCloudinaryBuffer(prepared, filename, options); }
  catch (error) {
    // Account-specific limits can be below our default. Do not send the same
    // rejected asset repeatedly, or downgrade its pixels to satisfy the provider.
    if (isProviderSizeError(error)) return uploadLargeImage(prepared, filename);
    throw error;
  }
}

async function uploadLargeImage(buffer: Buffer, filename: string): Promise<CloudinaryUploadResult> {
  if (!process.env.UPLOADTHING_TOKEN) throw new ImageStorageError(
    "This image exceeds the available storage upload limit. Your edits have not been saved. Automatic retries are paused until the image changes; you can retry manually.", false);
  const metadata = await sharp(buffer, { animated: true }).metadata();
  const { UTApi, UTFile } = await import("uploadthing/server");
  const client = new UTApi({ token: process.env.UPLOADTHING_TOKEN });
  const format = metadata.format ?? "png";
  const name = `${filename.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "_")}_${randomUUID()}.${format === "jpeg" ? "jpg" : format}`;
  try {
    const uploaded = await client.uploadFiles(new UTFile([new Uint8Array(buffer)], name, { type: `image/${format}` }), { acl: "public-read" });
    if (uploaded.error || !uploaded.data?.ufsUrl) throw new Error(uploaded.error?.message ?? "No storage result returned");
    return { secureUrl: uploaded.data.ufsUrl, publicId: `${ALTERNATE_ASSET_PREFIX}${uploaded.data.key}`,
      width: metadata.autoOrient.width, height: metadata.autoOrient.height, format };
  } catch (cause) {
    throw new ImageStorageError("The large image could not be stored. Your edits are still in the editor; please retry saving.", true, { cause });
  }
}

function uploadCloudinaryBuffer(buffer: Buffer, filename: string, options: CloudinaryUploadOptions): Promise<CloudinaryUploadResult> {
  const uniqueFilename = options.uniqueFilename ?? !options.overwrite;
  const basePublicId = filename.replace(/\.[^/.]+$/, "").replace(/:/g, "_");
  // unique_filename does not add a suffix when public_id is explicitly supplied.
  // Give each edit immutable pixels so repeat operations and undo keep their own sources.
  const publicId = uniqueFilename ? `${basePublicId}_${randomUUID()}` : basePublicId;
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "redux",
        public_id: publicId,
        use_filename: true,
        unique_filename: uniqueFilename,
        overwrite: options.overwrite ?? false,
        resource_type: "auto",
      },
      (error, result: UploadApiResponse | undefined) => {
        if (error || !result) {
          return reject(error ?? new Error("Upload failed: no result returned"));
        }
        resolve({
          secureUrl: result.secure_url,
          publicId: result.public_id,
          width: result.width,
          height: result.height,
          format: result.format,
        });
      }
    );

    stream.end(buffer);
  });
}

export async function deleteFromCloudinary(publicId: string): Promise<void> {
  if (publicId.startsWith(ALTERNATE_ASSET_PREFIX)) {
    const { UTApi } = await import("uploadthing/server");
    const result = await new UTApi({ token: process.env.UPLOADTHING_TOKEN }).deleteFiles(publicId.slice(ALTERNATE_ASSET_PREFIX.length));
    if (!result.success) throw new Error("Could not delete the large image asset");
    return;
  }
  await cloudinary.uploader.destroy(publicId);
}

export { cloudinary };
