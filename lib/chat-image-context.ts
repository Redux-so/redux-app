import { withTrustedEditorImage } from "@/lib/safe-remote-fetch";
import { prepareChatVisionBase64, prepareChatVisionImage, VisionImageError } from "@/lib/chat-image-vision-server";

import {
  type ChatImageMediaType,
  isChatImageMediaType,
} from "@/lib/chat-image-shared";

export { CHAT_VISION_MAX_PX, isChatImageMediaType, type ChatImageMediaType } from "@/lib/chat-image-shared";

/** Small JPEG for Claude vision — same transform as other AI routes. */
export function toVisionThumbnailUrl(url: string): string {
  if (url.includes("res.cloudinary.com") && url.includes("/upload/")) {
    return url.replace("/upload/", "/upload/w_400,q_70,f_jpg/");
  }
  return url;
}

function parseDataUrl(
  dataUrl: string,
): { base64: string; mediaType: ChatImageMediaType } | null {
  const comma = dataUrl.indexOf(",");
  if (comma === -1) return null;

  const header = dataUrl.slice(0, comma);
  const base64 = dataUrl.slice(comma + 1);
  const rawMediaType = header.replace("data:", "").replace(";base64", "");
  const mediaType = isChatImageMediaType(rawMediaType) ? rawMediaType : "image/jpeg";

  return { base64, mediaType };
}

/** Normalize the current source to a bounded vision preview. */
export async function fetchPreparedChatImage(imageUrl: string) {
  if (imageUrl.startsWith("data:")) {
    const image = parseDataUrl(imageUrl);
    if (!image) throw new VisionImageError();
    return prepareChatVisionBase64(image.base64);
  }
  return withTrustedEditorImage(toVisionThumbnailUrl(imageUrl), prepareChatVisionImage);
}
