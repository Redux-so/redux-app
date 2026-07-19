export interface ImageMetadata {
  favorite?: boolean;
}

export function parseImageMetadata(raw: unknown): ImageMetadata {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }

  const record = raw as Record<string, unknown>;
  return {
    favorite: record.favorite === true,
  };
}

export function isImageFavorite(raw: unknown): boolean {
  return parseImageMetadata(raw).favorite === true;
}

export function mergeImageMetadata(
  raw: unknown,
  patch: Partial<ImageMetadata>,
): Record<string, unknown> {
  const current =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? { ...(raw as Record<string, unknown>) }
      : {};

  if (patch.favorite !== undefined) {
    current.favorite = patch.favorite;
  }

  return current;
}
