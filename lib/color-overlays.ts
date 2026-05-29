export interface ColorOverlay {
  color: string;
  opacity: number;
  blendMode: "soft-light" | "color";
  rgb: { r: number; g: number; b: number };
}

const MAX_OPACITY = 0.42;

function overlay(
  r: number,
  g: number,
  b: number,
  strength: number,
  blendMode: ColorOverlay["blendMode"],
): ColorOverlay {
  return {
    color: `rgb(${r}, ${g}, ${b})`,
    opacity: strength * MAX_OPACITY,
    blendMode,
    rgb: { r, g, b },
  };
}

// ── Temperature ──────────────────────────────────────────────────────────────

const WARM_RGB = { r: 255, g: 176, b: 96 };
const COOL_RGB = { r: 96, g: 160, b: 255 };

/**
 * Warm (orange) / cool (blue) cast as a soft-light overlay.
 * Does NOT use hue-rotate so existing image hues are not remixed.
 */
export function getTemperatureOverlay(temperature: number): ColorOverlay | null {
  if (temperature === 0) return null;
  const strength = Math.min(1, Math.abs(temperature) / 100);
  const { r, g, b } = temperature > 0 ? WARM_RGB : COOL_RGB;
  return overlay(r, g, b, strength, "soft-light");
}

// ── Tint ─────────────────────────────────────────────────────────────────────

const TINT_GREEN_RGB = { r: 109, g: 184, b: 122 }; // #6db87a — matches slider track
const TINT_MAGENTA_RGB = { r: 201, g: 109, b: 184 }; // #c96db8 — matches slider track

/**
 * Green (negative) / magenta (positive) cast as a soft-light overlay.
 * Matches the green↔magenta gradient shown on the Tint slider track.
 */
export function getTintOverlay(tint: number): ColorOverlay | null {
  if (tint === 0) return null;
  const strength = Math.min(1, Math.abs(tint) / 100);
  const { r, g, b } = tint < 0 ? TINT_GREEN_RGB : TINT_MAGENTA_RGB;
  return overlay(r, g, b, strength, "soft-light");
}

// ── Hue ──────────────────────────────────────────────────────────────────────

/**
 * Convert HSL to RGB (all values 0–255).
 * Adapted from standard HSL→RGB formula.
 */
function hslToRgb(
  h: number,
  s: number,
  l: number,
): { r: number; g: number; b: number } {
  const sn = s / 100;
  const ln = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sn * Math.min(ln, 1 - ln);
  const f = (n: number) => ln - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return {
    r: Math.round(f(0) * 255),
    g: Math.round(f(8) * 255),
    b: Math.round(f(4) * 255),
  };
}

/**
 * Spectrum-aligned color cast as a "color" blend-mode overlay.
 * Maps hue (−100…100) → full HSL spectrum so the image is graded toward that
 * spectral hue without a global hue-rotate that remixes all existing colors.
 */
export function getHueOverlay(hue: number): ColorOverlay | null {
  if (hue === 0) return null;
  const strength = Math.min(1, Math.abs(hue) / 100);
  // Map −100…100 → 0…360 degrees
  const hslDeg = ((hue + 100) / 200) * 360;
  const { r, g, b } = hslToRgb(hslDeg, 80, 55);
  return overlay(r, g, b, strength, "color");
}

// ── Convenience ──────────────────────────────────────────────────────────────

export interface ActiveColorOverlays {
  temperature: ColorOverlay | null;
  tint: ColorOverlay | null;
  hue: ColorOverlay | null;
}

export function getColorOverlays(adj: {
  temperature: number;
  tint: number;
  hue: number;
}): ActiveColorOverlays {
  return {
    temperature: getTemperatureOverlay(adj.temperature),
    tint: getTintOverlay(adj.tint),
    hue: getHueOverlay(adj.hue),
  };
}
