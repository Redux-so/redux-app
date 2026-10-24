import { buildPreviewRequestBody, type PreviewPayload } from "@/lib/preview-request";
import { normalizeAdjustments } from "@/constants/adjustments";
import { getColorOverlays } from "@/lib/color-overlays";
import { applySoftwareImageFilter } from "@/lib/software-image-filter";
import { buildInteractiveFilter, interactiveFilterSettings } from "@/lib/interactive-image-filter";
import { loadDecodedImage } from "@/lib/decoded-image-cache";

let canvasFiltersSupported: boolean | undefined;

/** Test pixels once: assigning a missing `filter` property can silently do nothing. */
function supportsCanvasFilters(): boolean {
  if (canvasFiltersSupported !== undefined) return canvasFiltersSupported;
  const probe = document.createElement("canvas");
  probe.width = probe.height = 1;
  const ctx = probe.getContext("2d");
  if (!ctx || !("filter" in ctx)) return canvasFiltersSupported = false;
  ctx.fillStyle = "white";
  ctx.filter = "brightness(0)";
  ctx.fillRect(0, 0, 1, 1);
  const pixel = ctx.getImageData(0, 0, 1, 1).data;
  return canvasFiltersSupported = pixel[0] === 0 && pixel[3] === 255;
}

const sourceAlphas = new WeakMap<HTMLImageElement, Map<string, Uint8ClampedArray | null>>();

function sourceAlpha(source: HTMLImageElement, width: number, height: number): Uint8ClampedArray | null {
  const key = `${width}x${height}`;
  const cached = sourceAlphas.get(source);
  if (cached?.has(key)) return cached.get(key)!;
  const mask = document.createElement("canvas");
  mask.width = width;
  mask.height = height;
  const ctx = mask.getContext("2d")!;
  ctx.drawImage(source, 0, 0, width, height);
  const rgba = ctx.getImageData(0, 0, width, height).data;
  const alpha = new Uint8ClampedArray(width * height);
  let transparent = false;
  for (let i = 0; i < alpha.length; i++) {
    alpha[i] = rgba[i * 4 + 3];
    if (alpha[i] !== 255) transparent = true;
  }
  const result = transparent ? alpha : null;
  const sizes = cached ?? new Map<string, Uint8ClampedArray | null>();
  sizes.set(key, result);
  sourceAlphas.set(source, sizes);
  return result;
}

let grainCache: { width: number; height: number; canvas: HTMLCanvasElement } | null = null;

function grainTexture(width: number, height: number): HTMLCanvasElement {
  if (grainCache?.width === width && grainCache.height === height) return grainCache.canvas;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  const pixels = ctx.createImageData(width, height);
  for (let i = 0; i < width * height; i++) {
    let sample = (i + 1) ^ 0x9e3779b9;
    sample = Math.imul(sample ^ (sample >>> 16), 0x21f0aaad);
    sample = Math.imul(sample ^ (sample >>> 15), 0x735a2d97);
    const value = (sample ^ (sample >>> 15)) & 255;
    pixels.data.set([value, value, value, 255], i * 4);
  }
  ctx.putImageData(pixels, 0, 0);
  grainCache = { width, height, canvas };
  return canvas;
}

/** Local feedback: blend into the image, so Fabric applies geometry exactly once. */
export function renderInteractiveImage(
  source: HTMLImageElement,
  adjustments: Partial<Record<string, number>>,
  canvas = document.createElement("canvas"),
  fullSize = false,
): HTMLCanvasElement {
  const previewScale = Math.min(1, 1600 / Math.max(source.naturalWidth, source.naturalHeight));
  const scale = fullSize ? 1 : previewScale;
  const width = Math.max(1, Math.round(source.naturalWidth * scale));
  const height = Math.max(1, Math.round(source.naturalHeight * scale));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create the interactive image preview.");
  ctx.clearRect(0, 0, width, height);
  const alpha = sourceAlpha(source, width, height);
  const normalized = normalizeAdjustments(adjustments);
  const pixelScale = scale / previewScale;
  if (supportsCanvasFilters()) {
    ctx.filter = buildInteractiveFilter(normalized, pixelScale);
    ctx.drawImage(source, 0, 0, width, height);
    ctx.filter = "none";
  } else {
    ctx.drawImage(source, 0, 0, width, height);
    const settings = interactiveFilterSettings(normalized, pixelScale);
    if (settings.brightness !== 1 || settings.contrast !== 1 || settings.saturation !== 1 || settings.blur > 0) {
      const pixels = ctx.getImageData(0, 0, width, height);
      applySoftwareImageFilter(pixels.data, width, height, normalized, pixelScale);
      ctx.putImageData(pixels, 0, 0);
    }
  }

  const overlays = getColorOverlays(normalized);
  for (const overlay of [overlays.temperature, overlays.tint, overlays.hue]) {
    if (!overlay) continue;
    ctx.globalCompositeOperation = overlay.blendMode;
    ctx.globalAlpha = overlay.opacity;
    ctx.fillStyle = overlay.color;
    ctx.fillRect(0, 0, width, height);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  if (normalized.vignette > 0) {
    ctx.save();
    ctx.scale(width, height);
    const gradient = ctx.createRadialGradient(0.5, 0.5, 0, 0.5, 0.5, 0.7);
    gradient.addColorStop(0.35, "transparent");
    gradient.addColorStop(1, `rgba(0,0,0,${normalized.vignette / 100 * 0.9})`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1, 1);
    ctx.restore();
  }
  if (normalized.grain > 0) {
    ctx.globalCompositeOperation = "overlay";
    ctx.globalAlpha = normalized.grain / 100 * 0.6;
    ctx.drawImage(grainTexture(Math.max(1, Math.round(source.naturalWidth * previewScale)),
      Math.max(1, Math.round(source.naturalHeight * previewScale))), 0, 0, width, height);
  }
  // Color/effect overlays must not fill transparent regions or rotated padding.
  if (alpha) {
    const pixels = ctx.getImageData(0, 0, width, height);
    for (let i = 0; i < alpha.length; i++) pixels.data[i * 4 + 3] = alpha[i];
    ctx.putImageData(pixels, 0, 0);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  return canvas;
}

/** Render document pixels, never the editor viewport, using the canvas's renderer. */
export async function renderEditorPayload(payload: PreviewPayload, fullSize = false): Promise<PreviewPayload> {
  const body = buildPreviewRequestBody(payload);
  const source = await loadDecodedImage(body.imageBase64 ? `data:image/png;base64,${body.imageBase64}` : body.imageUrl ?? "");
  const rendered = renderInteractiveImage(source, payload.adjustments, undefined, fullSize);
  const blob = await new Promise<Blob>((resolve, reject) => {
    rendered.toBlob((result) => result ? resolve(result) : reject(new Error("Could not render image for export.")), "image/png");
  });
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not prepare image for export."));
    reader.readAsDataURL(blob);
  });
  return { ...payload, pixelsRendered: true, adjustments: {}, imageBase64: dataUrl.split(",")[1] };
}
