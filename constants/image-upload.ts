/** Shared by the browser and server upload validation */
export const IMAGE_UPLOAD_MAX_BYTES = 32 * 1024 * 1024;
export const IMAGE_UPLOAD_MIME_TYPES = ["image/jpeg", "image/png", "image/tiff"] as const;
export const IMAGE_UPLOAD_BATCH_LIMIT = 20;
export const IMAGE_UPLOAD_CONCURRENCY = 3;
