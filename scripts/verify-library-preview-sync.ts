import assert from "node:assert/strict";
import {
  applyLibraryPreviewUpdates,
  consumeLibraryPreviewUpdates,
  recordLibraryPreviewUpdate,
  LIBRARY_PREVIEW_UPDATES_KEY,
} from "../lib/library-preview-sync";
import { mergeImageRecords } from "../lib/merge-image-records";
import type { ImageRecord } from "../types/image";

function sampleImage(id: string, previewUrl?: string): ImageRecord {
  return {
    id,
    filename: `${id}.jpg`,
    originalUrl: "https://res.cloudinary.com/demo/original.jpg",
    previewUrl: previewUrl ?? null,
    publicId: id,
    utKey: null,
    width: 100,
    height: 100,
    size: 1000,
    format: "jpeg",
    createdAt: new Date().toISOString(),
    userId: "user_1",
  };
}

assert.equal(LIBRARY_PREVIEW_UPDATES_KEY, "redux:library-preview-updates");

const base = [sampleImage("a", "https://old"), sampleImage("b")];
const updated = applyLibraryPreviewUpdates(base, {
  a: "https://new",
});
assert.equal(updated[0]?.previewUrl, "https://new");
assert.equal(updated[1]?.previewUrl, null);

const merged = mergeImageRecords(
  [sampleImage("a", "https://old"), sampleImage("c")],
  [sampleImage("a", "https://fresh"), sampleImage("b")],
);
assert.deepEqual(
  merged.map((image) => image.id),
  ["a", "c", "b"],
);
assert.equal(merged[0]?.previewUrl, "https://fresh");

// Network responses can arrive after a later editor session has saved.
const storage = new Map<string, string>();
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
} });
try {
  recordLibraryPreviewUpdate("a", "https://latest", 200);
  recordLibraryPreviewUpdate("a", "https://late-old-response", 199);
  assert.equal(consumeLibraryPreviewUpdates().a, "https://latest");
  recordLibraryPreviewUpdate("a", "https://late-old-response", 199);
  assert.deepEqual(consumeLibraryPreviewUpdates(), {});
} finally {
  if (originalStorage) Object.defineProperty(globalThis, "sessionStorage", originalStorage);
  else Reflect.deleteProperty(globalThis, "sessionStorage");
}

console.log("verify-library-preview-sync: ok");
