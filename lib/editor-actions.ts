import { z } from "zod";
import { DEFAULT_ADJUSTMENTS } from "@/constants/adjustments";
import { CREDIT_COSTS, type CreditFeature } from "@/constants/credits";

const tool = z.enum(["blur", "eraser", "heal"]);
const values = z.object(Object.fromEntries(Object.keys(DEFAULT_ADJUSTMENTS).map((key) =>
  [key, z.number().min(-100).max(100).optional()]))).strict().refine((v) => Object.keys(v).length > 0);
const region = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1),
  width: z.number().gt(0).max(1), height: z.number().gt(0).max(1) }).strict()
  .refine((r) => r.x + r.width <= 1.000001 && r.y + r.height <= 1.000001, "Crop must fit inside the image");

export const editorActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("adjust"), values }).strict(),
  z.object({ type: z.literal("rotate"), degrees: z.union([z.literal(90), z.literal(-90), z.literal(180)]) }).strict(),
  z.object({ type: z.literal("flip"), axis: z.enum(["horizontal", "vertical"]) }).strict(),
  z.object({ type: z.literal("straighten"), degrees: z.number().min(-45).max(45) }).strict(),
  z.object({ type: z.literal("crop"), region }).strict(),
  z.object({ type: z.literal("crop_aspect"), width: z.number().gt(0).max(100), height: z.number().gt(0).max(100) }).strict(),
  z.object({ type: z.literal("resize"), width: z.number().int().min(1).max(16384), height: z.number().int().min(1).max(16384) }).strict(),
  z.object({ type: z.literal("brush"), tool, size: z.number().int().min(1).max(200), intensity: z.number().int().min(1).max(100).optional() }).strict(),
  z.object({ type: z.literal("apply_selection"), tool, intensity: z.number().int().min(1).max(100).optional() }).strict(),
  z.object({ type: z.literal("auto_enhance") }).strict(),
  z.object({ type: z.literal("auto_tone_balance") }).strict(),
  z.object({ type: z.literal("smart_color_balance") }).strict(),
  z.object({ type: z.literal("style_match") }).strict(),
  z.object({ type: z.literal("remove_background") }).strict(),
  z.object({ type: z.literal("generative_fill"), direction: z.enum(["left", "right", "top", "bottom"]), pixels: z.number().int().min(1).max(512), prompt: z.string().trim().min(1).max(2000) }).strict(),
  z.object({ type: z.literal("undo") }).strict(),
  z.object({ type: z.literal("redo") }).strict(),
  z.object({ type: z.literal("revert"), versionId: z.string().min(1).max(200) }).strict(),
]);
export const editorPlanSchema = z.object({ actions: z.array(editorActionSchema).min(1).max(8) }).strict()
  .refine((plan) => plan.actions.length === 1 || !plan.actions.some((a) => ["undo", "redo", "revert"].includes(a.type)), "History actions must run alone");
export type EditorAction = z.infer<typeof editorActionSchema>;
export type EditorPlan = z.infer<typeof editorPlanSchema>;
export interface ChatToolPlan extends EditorPlan { turnId: string; credits: number }
export interface EditorToolContext {
  width: number; height: number;
  transform: { rotation: number; flipX: boolean; flipY: boolean; straighten: number };
  selections: string[];
  brushSizes: { blur: number; eraser: number; heal: number };
  blurIntensity: number;
  versions: { id: string; label: string }[];
}

export function actionFeature(action: EditorAction): CreditFeature | null {
  if (action.type === "apply_selection") return action.tool === "heal" ? "heal" : action.tool === "eraser" ? "erase" : null;
  return ["auto_enhance", "auto_tone_balance", "smart_color_balance", "style_match", "remove_background", "generative_fill"].includes(action.type)
    ? action.type as CreditFeature : null;
}
export function actionCost(action: EditorAction): number {
  const feature = actionFeature(action);
  return feature ? CREDIT_COSTS[feature] : 0;
}
export function planCost(plan: EditorPlan): number { return plan.actions.reduce((sum, action) => sum + actionCost(action), 0); }
export function isRemoteAction(action: EditorAction): boolean { return action.type === "apply_selection" || actionFeature(action) !== null; }
export function actionLabel(action: EditorAction): string {
  switch (action.type) {
    case "adjust": return "Adjust sliders";
    case "rotate": return `Rotate ${action.degrees}°`;
    case "flip": return `Flip ${action.axis}`;
    case "straighten": return `Straighten to ${action.degrees}°`;
    case "crop": return "Crop image";
    case "crop_aspect": return `Crop to ${action.width}:${action.height}`;
    case "resize": return `Resize to ${action.width} × ${action.height}`;
    case "brush": return `Open ${action.tool} brush (${action.size}px)`;
    case "apply_selection": return `Apply ${action.tool} to painted selection`;
    case "auto_enhance": return "Auto enhance";
    case "auto_tone_balance": return "Auto tone balance";
    case "smart_color_balance": return "Smart color balance";
    case "style_match": return "Match reference style";
    case "remove_background": return "Remove background";
    case "generative_fill": return `Extend image ${action.direction} by ${action.pixels}px`;
    case "undo": return "Undo";
    case "redo": return "Redo";
    case "revert": return "Revert version";
  }
}

export function actionResultMessage(action: EditorAction, values?: Record<string, number>): string {
  const appliedValues = values ?? (action.type === "adjust" ? action.values : undefined);
  const details = appliedValues ? Object.entries(appliedValues).flatMap(([key, value]) =>
    typeof value === "number" ? [`${key.replace(/([A-Z])/g, " $1").toLowerCase()} ${value > 0 ? "+" : ""}${value}`] : []).join(", ") : "";
  return `${actionLabel(action)} completed.${details ? ` Applied ${details}.` : ""}`;
}

/** One validated tool request; execution stays in the editor, not in model prose. */
export const EDIT_PHOTO_TOOL = {
  name: "edit_photo",
  description: "Request an ordered plan of edits. The editor executes these actions, enforces credit costs, and reports actual results. Never claim success before execution. Paid actions require user approval. Use brush when no matching selection exists; do not guess subject masks. resize matches the panel's native center crop (no upscaling). crop uses normalized coordinates in the displayed, transformed image. crop_aspect is a centered aspect crop. style_match requires the attached reference. Undo/redo/revert must be the only action in a plan.",
  input_schema: z.toJSONSchema(editorPlanSchema) as { type: "object"; [key: string]: unknown },
};
