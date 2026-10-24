import { interactiveFilterSettings } from "@/lib/interactive-image-filter";

const clamp = (value: number) => Math.max(0, Math.min(255, value));

/** Same brightness/contrast/saturation sequence as Canvas filters, without browser filter support. */
export function applySoftwareImageFilter(
  pixels: Uint8ClampedArray, width: number, height: number,
  adjustments: Partial<Record<string, number>>, pixelScale = 1,
): void {
  const { brightness, contrast, saturation, blur } = interactiveFilterSettings(adjustments, pixelScale);
  const tone = new Float32Array(256);
  for (let value = 0; value < 256; value++) {
    tone[value] = clamp((clamp(value * brightness) - 127.5) * contrast + 127.5);
  }
  for (let i = 0; i < pixels.length; i += 4) {
    const r = tone[pixels[i]], g = tone[pixels[i + 1]], b = tone[pixels[i + 2]];
    const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    pixels[i] = gray + (r - gray) * saturation;
    pixels[i + 1] = gray + (g - gray) * saturation;
    pixels[i + 2] = gray + (b - gray) * saturation;
  }
  if (blur > 0) blurPixels(pixels, width, height, blur);
}

/** Three sliding box passes approximate Gaussian blur in linear time and bounded memory. */
function blurPixels(pixels: Uint8ClampedArray, width: number, height: number, sigma: number) {
  const ideal = Math.sqrt(4 * sigma * sigma + 1);
  let lower = Math.floor(ideal);
  if (lower % 2 === 0) lower--;
  const upper = lower + 2;
  const count = Math.round((12 * sigma * sigma - 3 * lower * lower - 12 * lower - 9) / (-4 * lower - 4));
  if (lower === 1 && count === 3) return;
  const scratch = new Uint8ClampedArray(pixels.length);
  // Premultiply so transparent pixels do not introduce colored fringes.
  for (let i = 0; i < pixels.length; i += 4) {
    const alpha = pixels[i + 3] / 255;
    pixels[i] *= alpha; pixels[i + 1] *= alpha; pixels[i + 2] *= alpha;
  }
  for (let pass = 0; pass < 3; pass++) {
    const radius = ((pass < count ? lower : upper) - 1) / 2;
    if (radius <= 0) continue;
    boxPass(pixels, scratch, width, height, radius, false);
    boxPass(scratch, pixels, width, height, radius, true);
  }
  for (let i = 0; i < pixels.length; i += 4) {
    const alpha = pixels[i + 3] / 255;
    if (alpha > 0) {
      pixels[i] /= alpha; pixels[i + 1] /= alpha; pixels[i + 2] /= alpha;
    }
  }
}

function boxPass(source: Uint8ClampedArray, target: Uint8ClampedArray,
  width: number, height: number, radius: number, vertical: boolean) {
  const length = vertical ? height : width;
  const lines = vertical ? width : height;
  const stride = vertical ? width * 4 : 4;
  const divisor = radius * 2 + 1;
  for (let line = 0; line < lines; line++) {
    const base = vertical ? line * 4 : line * width * 4;
    for (let channel = 0; channel < 4; channel++) {
      let sum = 0;
      for (let position = 0; position <= Math.min(radius, length - 1); position++) sum += source[base + position * stride + channel];
      for (let position = 0; position < length; position++) {
        target[base + position * stride + channel] = sum / divisor;
        const leaving = position - radius, entering = position + radius + 1;
        if (leaving >= 0) sum -= source[base + leaving * stride + channel];
        if (entering < length) sum += source[base + entering * stride + channel];
      }
    }
  }
}
