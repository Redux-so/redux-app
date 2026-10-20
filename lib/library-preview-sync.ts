import type { ImageRecord } from "@/types/image";

export const LIBRARY_PREVIEW_UPDATES_KEY = "redux:library-preview-updates";

export type LibraryPreviewUpdates = Record<string, string>;

function readUpdates(): LibraryPreviewUpdates {
  if (typeof sessionStorage === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(LIBRARY_PREVIEW_UPDATES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const updates: LibraryPreviewUpdates = {};
    for (const [id, url] of Object.entries(parsed)) {
      if (typeof id === "string" && typeof url === "string" && url.length > 0) {
        updates[id] = url;
      }
    }
    return updates;
  } catch {
    return {};
  }
}

/** Persist a library thumbnail URL after a successful preview save (per tab). */
export function recordLibraryPreviewUpdate(imageId: string, previewUrl: string): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    const updates = readUpdates();
    updates[imageId] = previewUrl;
    sessionStorage.setItem(LIBRARY_PREVIEW_UPDATES_KEY, JSON.stringify(updates));
  } catch {
    // Library still refetches from API when storage is unavailable.
  }
}

/** Read and clear pending preview URLs (call when library mounts or refetches). */
export function consumeLibraryPreviewUpdates(): LibraryPreviewUpdates {
  const updates = readUpdates();
  if (typeof sessionStorage === "undefined" || Object.keys(updates).length === 0) {
    return updates;
  }
  try {
    sessionStorage.removeItem(LIBRARY_PREVIEW_UPDATES_KEY);
  } catch {
    // Ignore — merged updates are still applied this session.
  }
  return updates;
}

export function applyLibraryPreviewUpdates(
  images: ImageRecord[],
  updates: LibraryPreviewUpdates,
): ImageRecord[] {
  if (Object.keys(updates).length === 0) return images;
  return images.map((image) => {
    const previewUrl = updates[image.id];
    return previewUrl ? { ...image, previewUrl } : image;
  });
}
