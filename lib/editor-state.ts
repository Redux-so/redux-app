import { normalizeAdjustments, type Adjustments } from "@/constants/adjustments";
import {
  type ImageTransform,
} from "@/lib/image-transform";

export const EDITOR_STATE_VERSION = 2;

export const DEFAULT_IMAGE_TRANSFORM: ImageTransform = {
  rotation: 0,
  flipX: false,
  flipY: false,
  straighten: 0,
};

export interface PersistedEditorState {
  sliders: Adjustments;
  transform: ImageTransform;
  workingImageUrl: string | null;
  workingWidth: number | null;
  workingHeight: number | null;
}

export function defaultPersistedEditorState(): PersistedEditorState {
  return {
    sliders: normalizeAdjustments({}),
    transform: { ...DEFAULT_IMAGE_TRANSFORM },
    workingImageUrl: null,
    workingWidth: null,
    workingHeight: null,
  };
}

function normalizeDimension(value: unknown): number | null {
  return typeof value === "number" && value > 0 ? Math.round(value) : null;
}

function normalizeTransform(raw: unknown): ImageTransform {
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_IMAGE_TRANSFORM };
  }
  const t = raw as Partial<ImageTransform>;
  return {
    rotation: typeof t.rotation === "number" ? t.rotation : 0,
    flipX: Boolean(t.flipX),
    flipY: Boolean(t.flipY),
    straighten: typeof t.straighten === "number" ? t.straighten : 0,
  };
}

/** Parse ImageVersion.adjustments — supports legacy flat sliders and v2 editor state. */
export function parseVersionAdjustments(raw: unknown): PersistedEditorState {
  if (!raw || typeof raw !== "object") {
    return defaultPersistedEditorState();
  }

  const obj = raw as Record<string, unknown>;

  if (obj.v === EDITOR_STATE_VERSION && obj.sliders && typeof obj.sliders === "object") {
    return {
      sliders: normalizeAdjustments(obj.sliders as Partial<Record<string, number>>),
      transform: normalizeTransform(obj.transform),
      workingImageUrl:
        typeof obj.workingImageUrl === "string" && obj.workingImageUrl.length > 0
          ? obj.workingImageUrl
          : null,
      workingWidth: normalizeDimension(obj.workingWidth),
      workingHeight: normalizeDimension(obj.workingHeight),
    };
  }

  return {
    sliders: normalizeAdjustments(obj as Partial<Record<string, number>>),
    transform: { ...DEFAULT_IMAGE_TRANSFORM },
    workingImageUrl: null,
    workingWidth: null,
    workingHeight: null,
  };
}

export function serializePersistedEditorState(
  state: PersistedEditorState,
): Record<string, unknown> {
  return {
    v: EDITOR_STATE_VERSION,
    sliders: state.sliders,
    transform: state.transform,
    workingImageUrl: state.workingImageUrl,
    workingWidth: state.workingWidth,
    workingHeight: state.workingHeight,
  };
}

function transformsEqual(a: ImageTransform, b: ImageTransform): boolean {
  return (
    a.rotation === b.rotation &&
    a.flipX === b.flipX &&
    a.flipY === b.flipY &&
    a.straighten === b.straighten
  );
}

export function persistedStatesEqual(
  a: PersistedEditorState,
  b: PersistedEditorState,
): boolean {
  if (a.workingImageUrl !== b.workingImageUrl) return false;
  if (a.workingWidth !== b.workingWidth) return false;
  if (a.workingHeight !== b.workingHeight) return false;
  if (!transformsEqual(a.transform, b.transform)) return false;
  return (Object.keys(a.sliders) as (keyof Adjustments)[]).every(
    (key) => a.sliders[key] === b.sliders[key],
  );
}

export function hasPersistedEdits(state: PersistedEditorState): boolean {
  const defaults = defaultPersistedEditorState();
  return !persistedStatesEqual(state, defaults);
}
