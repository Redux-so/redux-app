/** Shared by the browser and server upload validation */
export const EDITOR_SOURCE_MAX_SIZE = "128MB";
export const EDITOR_SOURCE_MAX_BYTES = 128 * 1024 * 1024;
export const IMAGE_UPLOAD_MAX_BYTES = 32 * 1024 * 1024;
// Leave room for multipart overhead below Vercel's 4.5 MB request limit.
export const IMAGE_MULTIPART_MAX_BYTES = 4 * 1024 * 1024;
export const IMAGE_UPLOAD_MIME_TYPES = ["image/jpeg", "image/png", "image/tiff"] as const;
export const IMAGE_UPLOAD_BATCH_LIMIT = 20;
export const IMAGE_UPLOAD_CONCURRENCY = 3;
