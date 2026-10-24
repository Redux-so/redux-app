import { normalizeAdjustments } from "@/constants/adjustments";

/** Shared browser filter for the stable canvas image and full-resolution exports. */
export function interactiveFilterSettings(adj: Partial<Record<string, number>>, pixelScale = 1) {
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

  return {
    brightness: Number(brightness.toFixed(3)),
    contrast: Number(sharpenedContrast.toFixed(3)),
    saturation: Number(saturate.toFixed(3)),
    blur: normalized.noiseReduction < 0
      ? Number((Math.abs(normalized.noiseReduction) / 100 * 2 * pixelScale).toFixed(2)) : 0,
  };
}

export function buildInteractiveFilter(adj: Partial<Record<string, number>>, pixelScale = 1): string {
  const settings = interactiveFilterSettings(adj, pixelScale);
  const parts = [
    `brightness(${settings.brightness.toFixed(3)})`,
    `contrast(${settings.contrast.toFixed(3)})`,
    `saturate(${settings.saturation.toFixed(3)})`,
  ];
  if (settings.blur > 0) parts.push(`blur(${settings.blur.toFixed(2)}px)`);
  return parts.join(" ");
}
