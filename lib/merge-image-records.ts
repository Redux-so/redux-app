import type { ImageRecord } from "@/types/image";

/** Append fetched pages without duplicate ids (stable order: existing first). */
export function mergeImageRecords(
  existing: ImageRecord[],
  incoming: ImageRecord[],
): ImageRecord[] {
  if (incoming.length === 0) return existing;
  const seen = new Set(existing.map((image) => image.id));
  const merged = [...existing];
  for (const image of incoming) {
    if (seen.has(image.id)) continue;
    seen.add(image.id);
    merged.push(image);
  }
  return merged;
}
