import { fetchTrustedMediaBuffer } from "@/lib/safe-remote-fetch";

const VALID_MEDIA_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;

export type ChatImageMediaType = (typeof VALID_MEDIA_TYPES)[number];

export function isChatImageMediaType(value: string): value is ChatImageMediaType {
  return VALID_MEDIA_TYPES.includes(value as ChatImageMediaType);
}

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

/** Resolve a workspace/reference image to base64 for Anthropic vision blocks. */
export async function fetchChatImageBase64(
  imageUrl: string,
): Promise<{ base64: string; mediaType: ChatImageMediaType }> {
  if (imageUrl.startsWith("data:")) {
    const parsed = parseDataUrl(imageUrl);
    if (!parsed) {
      throw new Error("Invalid data URL");
    }
    return parsed;
  }

  const fetchUrl = toVisionThumbnailUrl(imageUrl);
  const { buffer, contentType: headerTypeRaw } = await fetchTrustedMediaBuffer(fetchUrl);
  const base64 = buffer.toString("base64");
  const headerType = headerTypeRaw?.split(";")[0]?.trim();
  const mediaType =
    headerType && isChatImageMediaType(headerType) ? headerType : "image/jpeg";

  return { base64, mediaType };
}
