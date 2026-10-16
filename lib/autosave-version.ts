/** Internal label for the single mutable autosave row per image (not shown in version history). */
export const AUTOSAVE_VERSION_LABEL = "__autosave__";

export function isAutosaveVersionLabel(label: string | null | undefined): boolean {
  return label === AUTOSAVE_VERSION_LABEL || label === null;
}

/** Cloudinary public_id (no extension) for the working copy uploaded during autosave. */
export function workingImagePublicId(imagePublicId: string): string {
  return `${imagePublicId}-working`;
}

/** Cloudinary public_id (no extension) for the library thumbnail preview. */
export function previewImagePublicId(imageId: string): string {
  return `preview_${imageId}`;
}
