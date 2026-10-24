import { createUuid } from "@/lib/create-uuid";
import { type AdjustmentKey } from "@/constants/adjustments";
import { defaultPersistedEditorState, parseVersionAdjustments, persistedStatesEqual, serializePersistedEditorState, type PersistedEditorState } from "@/lib/editor-state";
import type { CanvasMasks } from "@/hooks/useCanvas";

export interface EditorHistoryState extends PersistedEditorState {
  masks?: CanvasMasks;
}

export interface EditorHistoryEntry {
  id: string;
  label: string;
  createdAt: string;
  state: EditorHistoryState;
  /** Painted selections support local undo, but aren't completed edits. */
  draft?: boolean;
}

export interface EditorTimeline {
  entries: EditorHistoryEntry[];
  cursor: number;
}

export interface SavedEditorVersion {
  id: string;
  adjustments: unknown;
  label: string | null;
  createdAt: string;
  legacy?: boolean;
}

/** One numbering scheme for the visible history and chat's version identifiers. */
export function editorHistoryRows(entries: EditorHistoryEntry[], versions: SavedEditorVersion[]) {
  const rows = [
    ...versions.map((version) => ({ ...version, id: `saved:${version.id}` })),
    ...entries.filter((entry) => entry.id !== "original").map((entry) => ({
      id: entry.id, createdAt: entry.createdAt, adjustments: serializePersistedEditorState(entry.state),
    })),
  ].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const numbered = rows.map((row, index) => ({ ...row, title: `Version ${index + 1}` }));
  const original = entries.find((entry) => entry.id === "original");
  if (original) numbered.unshift({ id: original.id, createdAt: "", title: "Original", adjustments: serializePersistedEditorState(original.state) });
  return numbered;
}

export const EDITOR_HISTORY_LIMIT = 1000;

const adjustmentLabels: Record<AdjustmentKey, string> = {
  exposure: "Exposure", contrast: "Contrast", blacks: "Blacks", whites: "Whites",
  highlights: "Highlights", shadows: "Shadows", vibrance: "Vibrance", saturation: "Saturation",
  temperature: "Temperature", tint: "Tint", hue: "Hue", sharpen: "Sharpen",
  noiseReduction: "Noise reduction", vignette: "Vignette", grain: "Grain", clarity: "Clarity",
};

export function describeEditorAction(before: PersistedEditorState, after: PersistedEditorState): string {
  if (before.workingImageUrl !== after.workingImageUrl) return "Image edited";
  if (before.transform.rotation !== after.transform.rotation) return "Rotation adjusted";
  if (before.transform.straighten !== after.transform.straighten) return "Straighten adjusted";
  if (before.transform.flipX !== after.transform.flipX || before.transform.flipY !== after.transform.flipY) return "Image flipped";
  const changed = (Object.keys(adjustmentLabels) as AdjustmentKey[]).filter((key) => before.sliders[key] !== after.sliders[key]);
  return changed.length === 1 ? `${adjustmentLabels[changed[0]]} adjusted` : "Adjustments applied";
}

export function createEditorTimeline(): EditorTimeline {
  return { entries: [{ id: "original", label: "Original", createdAt: "", state: defaultPersistedEditorState() }], cursor: 0 };
}

export function appendEditorHistory(timeline: EditorTimeline, state: EditorHistoryState, checkpoint: boolean, label?: string): EditorTimeline {
  const previous = timeline.entries[timeline.cursor].state;
  const draft = persistedStatesEqual(previous, state);
  let entries = timeline.entries.slice(0, timeline.cursor + 1);
  // Confirming a destructive edit consumes its temporary painted selections.
  if (!draft) entries = entries.filter((entry) => !entry.draft);
  const entry: EditorHistoryEntry = {
    id: createUuid(), label: (label ?? (draft ? "Painted selection" : describeEditorAction(previous, state))).slice(0, 120),
    createdAt: new Date().toISOString(), state, ...(draft ? { draft: true } : {}),
  };
  if (!checkpoint && entries.length > 1 && entries.at(-1)?.draft === entry.draft) {
    const current = entries.at(-1)!;
    entries[entries.length - 1] = { ...entry, id: current.id, label: label ? label.slice(0, 120) : current.label };
  } else {
    entries.push(entry);
  }
  // Keep Original and a bounded recent timeline; named versions are independent.
  if (!draft && entries.length > EDITOR_HISTORY_LIMIT) entries = [entries[0], ...entries.slice(1 - EDITOR_HISTORY_LIMIT)];
  return { entries, cursor: entries.length - 1 };
}

/** Selections are transient; persisted entries contain complete document states only. */
export function serializeEditorTimeline(timeline: EditorTimeline): Record<string, unknown> {
  const entries = timeline.entries.filter((entry) => !entry.draft);
  const selected = timeline.entries.slice(0, timeline.cursor + 1).filter((entry) => !entry.draft).at(-1)!;
  return {
    v: 1,
    cursor: entries.findIndex((entry) => entry.id === selected.id),
    entries: entries.map((entry) => ({ id: entry.id, label: entry.label, createdAt: entry.createdAt, state: serializePersistedEditorState(entry.state) })),
  };
}

/** Old autosaves become one honest recovery step; never invent their missing actions. */
export function parseEditorTimeline(raw: unknown): EditorTimeline {
  const fallback = createEditorTimeline();
  const saved = parseVersionAdjustments(raw);
  const history = raw && typeof raw === "object" ? (raw as Record<string, unknown>).history : null;
  if (history && typeof history === "object") {
    const h = history as Record<string, unknown>;
    if (h.v === 1 && Array.isArray(h.entries) && h.entries.length > 0 && h.entries.length <= EDITOR_HISTORY_LIMIT &&
      Number.isInteger(h.cursor) && Number(h.cursor) >= 0 && Number(h.cursor) < h.entries.length) {
      const entries: EditorHistoryEntry[] = [];
      for (const rawEntry of h.entries) {
        if (!rawEntry || typeof rawEntry !== "object") break;
        const entry = rawEntry as Record<string, unknown>;
        if (typeof entry.id !== "string" || typeof entry.label !== "string" || typeof entry.createdAt !== "string" || !entry.state) break;
        entries.push({ id: entry.id, label: entry.label, createdAt: entry.createdAt, state: parseVersionAdjustments(entry.state) });
      }
      if (entries.length === h.entries.length && new Set(entries.map((entry) => entry.id)).size === entries.length &&
        entries[0].id === "original" && persistedStatesEqual(entries[0].state, defaultPersistedEditorState()) &&
        persistedStatesEqual(entries[Number(h.cursor)].state, saved)) {
        return { entries, cursor: Number(h.cursor) };
      }
    }
  }
  return persistedStatesEqual(saved, fallback.entries[0].state) ? fallback
    : appendEditorHistory(fallback, saved, true, "Previous edits");
}

/** Legacy destructive checkpoints stored their source only in ImageVersion.url. */
export function normalizeSavedVersion(raw: unknown, url: string, originalUrl: string): Record<string, unknown> {
  const state = parseVersionAdjustments(raw);
  const fields = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  if (fields.v !== 2 && url !== originalUrl) state.workingImageUrl = url;
  return { ...fields, ...serializePersistedEditorState(state) };
}
