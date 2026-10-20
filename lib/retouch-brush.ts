export type RetouchTool = "blur" | "eraser" | "heal";
export type BrushSizes = Record<RetouchTool, number>;

/** Brush width in canvas scene pixels; each completed path retains its own width. */
export function normalizeBrushSize(size: number): number {
  return Number.isFinite(size) ? Math.min(200, Math.max(1, Math.round(size))) : 20;
}
