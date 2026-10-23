import type { AdjustmentKey } from "@/constants/adjustments";
import type { PersistedEditorState } from "@/lib/editor-state";
import { actionLabel, type EditorAction } from "@/lib/editor-actions";
import type { ActionOutcome } from "@/lib/editor-action-runner";

export interface EditorChange {
  key: string;
  label: string;
  from?: number | string;
  to: number | string;
}

export interface EditorChangeReview {
  changes: EditorChange[];
  canUndo: () => boolean;
  undo: () => Promise<void>;
  includesPaidTools: boolean;
}

export function adjustmentLabel(key: string): string {
  const label = key.replace(/([A-Z])/g, " $1");
  return label.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/** Values come from committed document states, never the model's intended plan. */
export function editorChanges(before: PersistedEditorState, after: PersistedEditorState, applied: EditorAction[]): EditorChange[] {
  const changes: EditorChange[] = (Object.keys(before.sliders) as AdjustmentKey[]).flatMap((key) =>
    before.sliders[key] === after.sliders[key] ? [] : [{ key, label: adjustmentLabel(key), from: before.sliders[key], to: after.sliders[key] }]);
  for (const key of ["rotation", "straighten", "flipX", "flipY"] as const) {
    const from = before.transform[key], to = after.transform[key];
    if (from === to) continue;
    changes.push({ key, label: key === "flipX" ? "Horizontal flip" : key === "flipY" ? "Vertical flip" : adjustmentLabel(key),
      from: typeof from === "boolean" ? (from ? "On" : "Off") : `${from}°`,
      to: typeof to === "boolean" ? (to ? "On" : "Off") : `${to}°` });
  }
  if (before.workingWidth !== after.workingWidth || before.workingHeight !== after.workingHeight) {
    changes.push({ key: "dimensions", label: "Dimensions",
      from: `${before.workingWidth} × ${before.workingHeight}`, to: `${after.workingWidth} × ${after.workingHeight}` });
  }
  for (const [index, action] of applied.entries()) {
    if (["adjust", "rotate", "flip", "straighten", "brush"].includes(action.type)) continue;
    changes.push({ key: `action:${index}`, label: actionLabel(action), to: "Applied" });
  }
  return changes;
}

function adjustmentSummary(changes: EditorChange[]): string {
  const phrases = changes.flatMap((change) => {
    if (typeof change.from !== "number" || typeof change.to !== "number") return [];
    const up = change.to > change.from;
    switch (change.key) {
      case "exposure": return [up ? "brightened the image" : "darkened the image"];
      case "contrast": return [up ? "increased contrast" : "softened contrast"];
      case "shadows": return [up ? "lifted the shadows" : "deepened the shadows"];
      case "highlights": return [up ? "lifted the highlights" : "softened the highlights"];
      case "temperature": return [up ? "warmed the colors" : "cooled the colors"];
      case "saturation": case "vibrance": return [up ? "boosted the colors" : "softened the colors"];
      case "grain": return [up ? "added grain" : "reduced grain"];
      default: return [`adjusted ${change.label.toLowerCase()}`];
    }
  });
  const unique = [...new Set(phrases)];
  if (!unique.length) return "Adjusted the image";
  const sentence = unique.length === 1 ? unique[0] : unique.length === 2 ? unique.join(" and ")
    : unique.length === 3 ? `${unique[0]}, ${unique[1]}, and ${unique[2]}`
    : `${unique.slice(0, 2).join(", ")}, and refined the remaining adjustments`;
  return sentence[0].toUpperCase() + sentence.slice(1);
}

/** Keep exact settings in the review panel and honest, concise results in chat. */
export function editorReply(outcomes: ActionOutcome[], actions: EditorAction[], changes: EditorChange[]): string {
  const summaries = outcomes.flatMap((outcome, index) => {
    if (outcome.status !== "applied") return [];
    const action = actions[index];
    switch (action.type) {
      case "adjust": return changes.some((change) => change.key in (action.values)) ? [adjustmentSummary(changes)] : [];
      case "rotate": return ["Rotated the image"];
      case "flip": return [`Flipped the image ${action.axis === "horizontal" ? "horizontally" : "vertically"}`];
      case "straighten": return ["Straightened the image"];
      case "crop": case "crop_aspect": return ["Cropped the image"];
      case "resize": return ["Adjusted the image dimensions"];
      case "remove_background": return ["Removed the background"];
      case "generative_fill": return ["Extended the image"];
      case "auto_enhance": return ["Applied auto enhance"];
      case "auto_tone_balance": return ["Balanced the image tones"];
      case "smart_color_balance": return ["Balanced the colors"];
      case "style_match": return ["Matched the reference style"];
      case "apply_selection": return [action.tool === "blur" ? "Blurred the selected area" : action.tool === "heal" ? "Healed the selected area" : "Erased the selected area"];
      case "undo": return ["Undid the previous edit"];
      case "redo": return ["Reapplied the previous edit"];
      case "revert": return ["Restored the selected version"];
      default: return [];
    }
  });
  const unique = [...new Set(summaries)];
  let message = unique.length === 1 ? `${unique[0]}.` : unique.length > 1 ? `**Edits applied**\n\n${unique.map((line) => `• ${line}`).join("\n")}` : "";
  for (const outcome of outcomes.filter((result) => result.status !== "applied")) {
    message += `\n\n${outcome.status === "failed" ? `**${outcome.action} could not be applied.** ` : ""}${outcome.message}`;
  }
  return message.trim() || "The requested settings already match your image.";
}
