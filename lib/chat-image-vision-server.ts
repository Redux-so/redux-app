import sharp from "sharp";

import {
  CHAT_VISION_MAX_PX,
  type ChatImageMediaType,
} from "@/lib/chat-image-shared";

/** Server-only: downscale bytes for Anthropic vision (PNG, ≤1000px). */
export async function prepareChatVisionBase64(
  base64: string,
): Promise<{ base64: string; mediaType: ChatImageMediaType }> {
  const imageBuffer = Buffer.from(base64, "base64");
  const pngBuffer = await sharp(imageBuffer)
    .rotate()
    .resize(CHAT_VISION_MAX_PX, CHAT_VISION_MAX_PX, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .png()
    .toBuffer();
  return {
    base64: pngBuffer.toString("base64"),
    mediaType: "image/png",
  };
}
