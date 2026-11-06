import sharp from "sharp";
import { uploadToCloudinary, deleteFromCloudinary } from "@/lib/cloudinary";
import { CLOUDINARY_IMAGE_MAX_BYTES } from "@/lib/image-storage";

/** Large alternate-storage files need a small cover; never use it as the editor source. */
export async function storeLibraryUpload(buffer: Buffer, name: string, mimeType: string) {
  const needsCover = buffer.length > CLOUDINARY_IMAGE_MAX_BYTES || mimeType === "image/tiff";
  const [original, cover] = await Promise.allSettled([
    uploadToCloudinary(buffer, name, { preserveOriginal: true }),
    needsCover ? createLibraryUploadCover(buffer, name) : Promise.resolve(null),
  ]);
  if (original.status === "rejected") {
    if (cover.status === "fulfilled" && cover.value) {
      await deleteFromCloudinary(cover.value.publicId).catch((error) => console.error("[upload] Cover cleanup failed", error));
    }
    throw original.reason;
  }
  // A preview failure must never turn a stored original into a failed upload.
  if (cover.status === "rejected") console.error("[upload] Cover unavailable", cover.reason);
  return { ...original.value, cover: cover.status === "fulfilled" ? cover.value : null };
}

export async function createLibraryUploadCover(buffer: Buffer, name: string) {
  const cover = await sharp(buffer).rotate().resize(512, 512, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 85, effort: 2 }).toBuffer();
  return uploadToCloudinary(cover, `${name.replace(/\.[^/.]+$/, "")}_upload_cover.webp`, { preserveOriginal: true });
}
