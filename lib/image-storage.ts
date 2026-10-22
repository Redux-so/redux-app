import sharp from "sharp";

/** Observed account limit. Leave headroom only in encoders, never by discarding pixels. */
export const CLOUDINARY_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const ALTERNATE_ASSET_PREFIX = "uploadthing:";

export function alternateAssetIdFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || !(parsed.hostname === "utfs.io" || parsed.hostname.endsWith(".ufs.sh"))) return null;
    const key = parsed.pathname.match(/^\/(?:f|file)\/([^/]+)$/)?.[1];
    return key ? `${ALTERNATE_ASSET_PREFIX}${decodeURIComponent(key)}` : null;
  } catch { return null; }
}

export class ImageStorageError extends Error {
  readonly code: "IMAGE_STORAGE_LIMIT" | "IMAGE_STORAGE_UNAVAILABLE";
  constructor(message: string, readonly retryable: boolean, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ImageStorageError";
    this.code = retryable ? "IMAGE_STORAGE_UNAVAILABLE" : "IMAGE_STORAGE_LIMIT";
  }
}

export function isProviderSizeError(error: unknown): boolean {
  const message = error && typeof error === "object" && "message" in error ? String(error.message) : "";
  return /file size too large|file too large|maximum.*file size/i.test(message);
}

/** Preserve resolution, alpha, and bit depth. Never fall back to lossy compression. */
export async function prepareStorageImage(buffer: Buffer, limit = CLOUDINARY_IMAGE_MAX_BYTES): Promise<Buffer> {
  if (buffer.length <= limit) return buffer;
  const metadata = await sharp(buffer, { animated: true }).metadata();
  // Retain multi-page files and high-bit-depth masters unchanged for alternate storage.
  if ((metadata.pages ?? 1) > 1 || (metadata.depth && metadata.depth !== "uchar")) return buffer;

  const png = await sharp(buffer).keepMetadata().png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
  let smallest = png.length < buffer.length ? png : buffer;
  if (smallest.length <= limit) return smallest;
  // WebP cannot represent dimensions above 16383; it must not resize to fit.
  if ((metadata.width ?? 0) <= 16383 && (metadata.height ?? 0) <= 16383) {
    const webp = await sharp(buffer).keepMetadata().webp({ lossless: true, effort: 6 }).toBuffer();
    if (webp.length < smallest.length) smallest = webp;
  }
  return smallest;
}

/** Error metadata safe to expose; provider credentials and internal stacks stay private. */
export function imageStorageErrorBody(error: unknown): { error: string; code: string; retryable: boolean } | null {
  if (error instanceof ImageStorageError) return { error: error.message, code: error.code, retryable: error.retryable };
  if (isProviderSizeError(error)) return {
    error: "This image exceeds the storage upload limit. Your edits have not been saved. Automatic retries are paused until the image changes; you can retry manually.",
    code: "IMAGE_STORAGE_LIMIT", retryable: false,
  };
  return null;
}
