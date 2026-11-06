import { transformedDimensions, type ImageTransform } from "@/lib/image-transform";

/** Rasterize source pixels, never the viewport or Fabric's selection objects. */
export function transformedSource(source: HTMLImageElement | HTMLCanvasElement, transform: ImageTransform): HTMLCanvasElement {
  const sourceWidth = "naturalWidth" in source ? source.naturalWidth : source.width;
  const sourceHeight = "naturalHeight" in source ? source.naturalHeight : source.height;
  const { width, height } = transformedDimensions(sourceWidth, sourceHeight, transform);
  const output = document.createElement("canvas");
  output.width = width;
  output.height = height;
  const ctx = output.getContext("2d");
  if (!ctx) throw new Error("Could not create image composition");
  ctx.translate(width / 2, height / 2);
  ctx.rotate((transform.rotation + transform.straighten) * Math.PI / 180);
  ctx.scale(transform.flipX ? -1 : 1, transform.flipY ? -1 : 1);
  ctx.drawImage(source, -sourceWidth / 2, -sourceHeight / 2);
  return output;
}

/** Project a scene-coordinate brush bitmap back into untransformed source pixels. */
export function drawSourceMask(ctx: CanvasRenderingContext2D, bitmap: HTMLImageElement,
  bounds: { left: number; top: number; width: number; height: number },
  width: number, height: number, transform: ImageTransform) {
  const rotated = transformedDimensions(width, height, transform);
  ctx.translate(width / 2, height / 2);
  ctx.scale(transform.flipX ? -1 : 1, transform.flipY ? -1 : 1);
  ctx.rotate(-(transform.rotation + transform.straighten) * Math.PI / 180);
  ctx.drawImage(bitmap, bounds.left, bounds.top, bounds.width, bounds.height,
    -rotated.width / 2, -rotated.height / 2, rotated.width, rotated.height);
}
