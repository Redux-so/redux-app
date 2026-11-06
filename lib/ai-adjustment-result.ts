import { DEFAULT_ADJUSTMENTS, normalizeAdjustmentPatch, type Adjustments } from "@/constants/adjustments";

export function parseUsefulAdjustmentPatch(
  text: string,
  current: Partial<Adjustments> = {},
): Partial<Adjustments> | null {
  let value: unknown;
  try {
    value = JSON.parse(text.replace(/```(?:json)?\n?/g, "").replace(/```/g, "").trim());
  } catch {
    return null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const numeric = Object.fromEntries(Object.entries(value).filter(([, amount]) => Number.isFinite(amount)));
  const patch = normalizeAdjustmentPatch(numeric);
  const changed = Object.entries(patch).filter(([key, amount]) => {
    const adjustment = key as keyof Adjustments;
    return Object.hasOwn(DEFAULT_ADJUSTMENTS, adjustment) && Number.isFinite(amount) && amount >= -100 && amount <= 100 &&
      amount !== (current[adjustment] ?? DEFAULT_ADJUSTMENTS[adjustment]);
  });
  return changed.length ? Object.fromEntries(changed) : null;
}
