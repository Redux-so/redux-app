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
