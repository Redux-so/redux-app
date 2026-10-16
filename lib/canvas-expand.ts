export type ExpandDirection = "top" | "bottom" | "left" | "right";

/**
 * Build a new canvas with extra transparent space on one side. The original
 * pixels are unchanged; new areas are fully transparent (alpha 0).
 */
export function createExpandedCanvas(
  originalCanvas: HTMLCanvasElement,
  direction: ExpandDirection,
  pixels: number,
): HTMLCanvasElement {
  const ow = originalCanvas.width;
  const oh = originalCanvas.height;
  const p = Math.max(0, Math.round(pixels));

  let nw: number;
  let nh: number;
  let dx: number;
  let dy: number;

  switch (direction) {
    case "top":
      nw = ow;
      nh = oh + p;
      dx = 0;
      dy = p;
      break;
    case "bottom":
      nw = ow;
      nh = oh + p;
      dx = 0;
      dy = 0;
      break;
    case "left":
      nw = ow + p;
      nh = oh;
      dx = p;
      dy = 0;
      break;
    case "right":
      nw = ow + p;
      nh = oh;
      dx = 0;
      dy = 0;
      break;
  }

  const out = document.createElement("canvas");
  out.width = nw;
  out.height = nh;
  const ctx = out.getContext("2d");
  if (!ctx) return out;
  ctx.clearRect(0, 0, nw, nh);
  ctx.drawImage(originalCanvas, dx, dy);
  return out;
}
