import type { ImageRecord } from "@/types/image";

/** Merge fetched pages: refresh existing rows, append new ids (stable order). */
export function mergeImageRecords(
  existing: ImageRecord[],
  incoming: ImageRecord[],
): ImageRecord[] {
  if (incoming.length === 0) return existing;
  const incomingById = new Map(incoming.map((image) => [image.id, image]));
  const refreshed = existing.map((image) => incomingById.get(image.id) ?? image);
  const seen = new Set(refreshed.map((image) => image.id));
  for (const image of incoming) {
    if (seen.has(image.id)) continue;
    seen.add(image.id);
    refreshed.push(image);
  }
  return refreshed;
}
