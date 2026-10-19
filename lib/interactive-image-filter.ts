import { normalizeAdjustments } from "@/constants/adjustments";

/** Shared browser filter for the stable canvas image and full-resolution exports. */
export function buildInteractiveFilter(adj: Partial<Record<string, number>>, pixelScale = 1): string {
  const normalized = normalizeAdjustments(adj);

  // Exposure + partial contributions from tonal controls → CSS brightness()
  const brightness = Math.max(
    0.05,
    1 +
      normalized.exposure / 100 +
      normalized.shadows / 300 +
      normalized.highlights / 300 +
      normalized.whites / 300 +
      -normalized.blacks / 300,
  );

  // Contrast: base + clarity approximation (clarity ≈ midtone contrast)
  const contrast = Math.max(0.05, 1 + (normalized.contrast + normalized.clarity * 0.4) / 100);

  // Saturation: saturation + vibrance at half weight
  const saturate = Math.max(0, 1 + (normalized.saturation + normalized.vibrance * 0.5) / 100);

  // Sharpen: approximate via contrast boost
  const sharpenedContrast = contrast * (1 + Math.max(0, normalized.sharpen) * 0.005);

  // Temperature, tint, and hue all use separate color overlays — no hue-rotate
  const parts = [
    `brightness(${brightness.toFixed(3)})`,
    `contrast(${sharpenedContrast.toFixed(3)})`,
    `saturate(${saturate.toFixed(3)})`,
  ];

  // Noise reduction: CSS Gaussian blur is a valid real-time approximation.
  // Slider left (negative) = more blur: noiseReduction=-100 → 2px, 0 → 0px.
  if (normalized.noiseReduction < 0) {
    const blurPx = (Math.abs(normalized.noiseReduction) / 100) * 2 * pixelScale;
    parts.push(`blur(${blurPx.toFixed(2)}px)`);
  }

  return parts.join(" ");
}

