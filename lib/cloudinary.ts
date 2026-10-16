import { v2 as cloudinary } from "cloudinary";
import type { UploadApiResponse } from "cloudinary";

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
}

export function uploadToCloudinary(
  buffer: Buffer,
  filename: string,
  options: CloudinaryUploadOptions = {},
): Promise<CloudinaryUploadResult> {
  const uniqueFilename = options.uniqueFilename ?? !options.overwrite;
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "redux",
        public_id: filename.replace(/\.[^/.]+$/, ""),
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
  await cloudinary.uploader.destroy(publicId);
}

export { cloudinary };
