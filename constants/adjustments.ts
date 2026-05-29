export const DEFAULT_ADJUSTMENTS = {
  exposure: 0,
  contrast: 0,
  blacks: 0,
  whites: 0,
  highlights: 0,
  shadows: 0,
  vibrance: 0,
  saturation: 0,
  temperature: 0,
  tint: 0,
  hue: 0,
  sharpen: 0,
  noiseReduction: 0,
  vignette: 0,
  grain: 0,
  clarity: 0,
} as const;

export type AdjustmentKey = keyof typeof DEFAULT_ADJUSTMENTS;

export type Adjustments = { [K in AdjustmentKey]: number };

/**
 * Folds legacy `brightness` into `exposure` (they were redundant) and returns
 * a full adjustment object safe for canvas, export, and editor state.
 */
export function normalizeAdjustments(
  input: Partial<Record<string, number>>,
): Adjustments {
  const legacyBrightness =
    typeof input.brightness === "number" ? input.brightness : 0;
  const result = { ...DEFAULT_ADJUSTMENTS } as Adjustments;

  for (const key of Object.keys(DEFAULT_ADJUSTMENTS) as AdjustmentKey[]) {
    if (key === "exposure") {
      result.exposure =
        (typeof input.exposure === "number" ? input.exposure : 0) +
        legacyBrightness;
    } else if (typeof input[key] === "number") {
      result[key] = input[key];
    }
  }

  return result;
}

/** Normalize a partial AI/saved patch before merging into editor state. */
export function normalizeAdjustmentPatch(
  patch: Partial<Record<string, number>>,
): Partial<Adjustments> {
  const { brightness, exposure, ...rest } = patch;
  const result: Partial<Adjustments> = {};

  for (const [key, value] of Object.entries(rest)) {
    if (key in DEFAULT_ADJUSTMENTS && typeof value === "number") {
      result[key as AdjustmentKey] = value;
    }
  }

  if (typeof brightness === "number" || typeof exposure === "number") {
    result.exposure =
      (typeof exposure === "number" ? exposure : 0) +
      (typeof brightness === "number" ? brightness : 0);
  }

  return result;
}
