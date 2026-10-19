/** True when URL is a baked library thumbnail, not a render base. */
export function isStoredPreviewUrl(
  url: string,
  storedPreviewUrl?: string | null,
): boolean {
  return Boolean(storedPreviewUrl && url === storedPreviewUrl);
}

export type PreviewSource =
  | { kind: "url"; url: string }
  | { kind: "base64"; base64: string };

/**
 * Pick the pixel source for generate-preview / export.
 * Never use a baked preview thumbnail as the adjustment base.
 */
export function resolvePreviewSourceUrl(options: {
  imageUrl?: string | null;
  originalUrl: string;
  storedPreviewUrl?: string | null;
  imageBase64?: string | null;
}): PreviewSource {
  const { imageUrl, originalUrl, storedPreviewUrl, imageBase64 } = options;

  if (imageBase64) {
    return { kind: "base64", base64: imageBase64 };
  }

  if (!imageUrl) {
    return { kind: "url", url: originalUrl };
  }

  if (imageUrl.startsWith("data:")) {
    const comma = imageUrl.indexOf(",");
    if (comma < 0) {
      throw new Error("Invalid data URL — send imageBase64 in the request body");
    }
    return { kind: "base64", base64: imageUrl.slice(comma + 1) };
  }

  if (isStoredPreviewUrl(imageUrl, storedPreviewUrl)) {
    return { kind: "url", url: originalUrl };
  }

  return { kind: "url", url: imageUrl };
}
