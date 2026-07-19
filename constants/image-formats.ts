/** Library file-type filter labels → recognized extensions (lowercase, no dot). */
export const LIBRARY_FILE_TYPE_EXTENSIONS = {
  jpeg: ["jpg", "jpeg"],
  png: ["png"],
  tiff: ["tif", "tiff"],
  raw: ["raw", "cr2", "cr3", "nef", "arw", "dng", "orf", "rw2"],
} as const;

export type LibraryFileTypeKey = keyof typeof LIBRARY_FILE_TYPE_EXTENSIONS;
