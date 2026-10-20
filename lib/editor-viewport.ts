export type ViewportTransform = [number, number, number, number, number, number];
export interface ViewportRect { left: number; top: number; width: number; height: number }

function boundAxis(translation: number, start: number, size: number, zoom: number, viewport: number): number {
  const extent = size * zoom;
  if (extent <= viewport) return (viewport - extent) / 2 - start * zoom;
  return Math.max(viewport - (start + size) * zoom, Math.min(-start * zoom, translation));
}

/** Shared by wheel/button zoom, canvas dragging, resizing, and navigator movement. */
export function constrainViewport(transform: ViewportTransform, image: ViewportRect, width: number, height: number): ViewportTransform {
  return [transform[0], transform[1], transform[2], transform[3],
    boundAxis(transform[4], image.left, image.width, transform[0], width),
    boundAxis(transform[5], image.top, image.height, transform[3], height)];
}

/** Visible rectangle in the full, transformed composition, normalized to 0–1. */
export function visibleImageRect(image: ViewportRect, transform: ViewportTransform, width: number, height: number): ViewportRect {
  const left = Math.max(0, Math.min(1, (-transform[4] / transform[0] - image.left) / image.width));
  const top = Math.max(0, Math.min(1, (-transform[5] / transform[3] - image.top) / image.height));
  const right = Math.max(left, Math.min(1, ((width - transform[4]) / transform[0] - image.left) / image.width));
  const bottom = Math.max(top, Math.min(1, ((height - transform[5]) / transform[3] - image.top) / image.height));
  return { left, top, width: right - left, height: bottom - top };
}

/** Fit the composition into a thumbnail without stretching; offsets are letterboxing. */
export function fitNavigatorImage(image: ViewportRect, width: number, height: number): ViewportRect {
  const scale = Math.min(width / image.width, height / image.height);
  const w = image.width * scale;
  const h = image.height * scale;
  return { left: (width - w) / 2, top: (height - h) / 2, width: w, height: h };
}

/** Similar visual area across orientations, with caps for extreme aspect ratios. */
export function navigatorPreviewSize(image: ViewportRect, workspaceWidth: number, workspaceHeight: number) {
  const ratio = image.width / image.height;
  const compact = workspaceWidth < 360 ? 0.6 : 1;
  const width = Math.sqrt(112 * 168 * ratio) * compact;
  const height = width / ratio;
  const scale = Math.min(1, Math.max(1, workspaceWidth - 24) / width,
    208 * compact / width, 192 * compact / height,
    Math.max(1, workspaceHeight * 0.4) / height);
  return { width: width * scale, height: height * scale };
}
