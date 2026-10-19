export interface ImageTransform {
  rotation: number;
  flipX: boolean;
  flipY: boolean;
  straighten: number;
}

export function hasImageTransform(transform?: ImageTransform | null): boolean {
  if (!transform) return false;
  return (
    transform.rotation !== 0 ||
    transform.flipX ||
    transform.flipY ||
    transform.straighten !== 0
  );
}

/** Bounds of the complete rotated composition, independent of the viewport. */
export function transformedDimensions(width: number, height: number, transform?: ImageTransform) {
  const angle = ((transform?.rotation ?? 0) + (transform?.straighten ?? 0)) * Math.PI / 180;
  const cosine = Math.abs(Math.cos(angle));
  const sine = Math.abs(Math.sin(angle));
  return { width: Math.round(width * cosine + height * sine), height: Math.round(width * sine + height * cosine) };
}
