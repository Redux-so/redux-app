export interface TemperatureOverlay {
  color: string;
  opacity: number;
  blendMode: "soft-light";
  rgb: { r: number; g: number; b: number };
}

const WARM_RGB = { r: 255, g: 176, b: 96 };
const COOL_RGB = { r: 96, g: 160, b: 255 };

/** Opacity at |temperature| === 100 — scaled linearly from 0. */
const MAX_TEMPERATURE_OVERLAY_OPACITY = 0.42;

/**
 * Warm/cool color cast as a blend-mode overlay (not hue rotation) so existing
 * image colors are graded toward orange/blue instead of remixed into pink/green.
 */
export function getTemperatureOverlay(
  temperature: number,
): TemperatureOverlay | null {
  if (temperature === 0) return null;

  const strength = Math.min(1, Math.abs(temperature) / 100);
  const opacity = strength * MAX_TEMPERATURE_OVERLAY_OPACITY;
  const rgb = temperature > 0 ? WARM_RGB : COOL_RGB;

  return {
    color: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`,
    opacity,
    blendMode: "soft-light",
    rgb,
  };
}
