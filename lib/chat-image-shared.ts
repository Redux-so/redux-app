/** Max longest edge for Claude vision blocks (matches style-match). */
export const CHAT_VISION_MAX_PX = 1000;

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
