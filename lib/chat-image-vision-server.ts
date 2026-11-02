import sharp from "sharp";

import {
  CHAT_VISION_MAX_PX,
  type ChatImageMediaType,
} from "@/lib/chat-image-shared";

/** Conservative encoded-byte cap, below both the 5 MB and 10 MB vision limits. */
export const VISION_BASE64_MAX_BYTES = 4 * 1024 * 1024;

export class VisionImageError extends Error {
  constructor() { super("Could not prepare the image. Please choose a valid JPEG, PNG, WebP, or TIFF image."); }
}

/** Server-only: normalize actual bytes, orientation and size, independent of storage or MIME headers. */
export async function prepareChatVisionBase64(
  base64: string,
): Promise<{ base64: string; mediaType: ChatImageMediaType }> {
  try {
    const imageBuffer = Buffer.from(base64, "base64");
    const resized = sharp(imageBuffer).rotate().toColourspace("srgb")
      .resize(CHAT_VISION_MAX_PX, CHAT_VISION_MAX_PX, { fit: "inside", withoutEnlargement: true });
    const png = (await resized.clone().png().toBuffer()).toString("base64");
    if (png.length <= VISION_BASE64_MAX_BYTES) return { base64: png, mediaType: "image/png" };
    const jpeg = (await resized.flatten({ background: "white" }).jpeg({ quality: 82 }).toBuffer()).toString("base64");
    if (jpeg.length > VISION_BASE64_MAX_BYTES) throw new VisionImageError();
    return { base64: jpeg, mediaType: "image/jpeg" };
  } catch {
    throw new VisionImageError();
  }
}
