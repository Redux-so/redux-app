"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import useUndo from "use-undo";
import { DEFAULT_ADJUSTMENTS, normalizeAdjustments, type AdjustmentKey } from "@/constants/adjustments";
import {
  defaultPersistedEditorState,
  parseVersionAdjustments,
  persistedStatesEqual,
  serializePersistedEditorState,
  type PersistedEditorState,
} from "@/lib/editor-state";
import type { ImageTransform } from "@/lib/image-transform";

export type Adjustments = typeof DEFAULT_ADJUSTMENTS;

export interface EditorCanvasSnapshot {
  transform: ImageTransform;
  workingImageUrl: string | null;
  imageBase64: string | null;
  originalUrl: string | null;
  workingWidth: number | null;
  workingHeight: number | null;
}

export interface UseEditorOptions {
  getCanvasSnapshot?: () => EditorCanvasSnapshot;
  onPersistedRestore?: (state: PersistedEditorState) => void;
  onVersionLoaded?: () => void;
  canAutoSave?: () => boolean;
}

function adjustmentsEqual(a: Adjustments, b: Adjustments): boolean {
  return (Object.keys(DEFAULT_ADJUSTMENTS) as AdjustmentKey[]).every(
    (key) => a[key] === b[key],
  );
}

export function useEditor(imageId?: string, options: UseEditorOptions = {}) {
  const { getCanvasSnapshot, onPersistedRestore, onVersionLoaded, canAutoSave } = options;
  const getCanvasSnapshotRef = useRef(getCanvasSnapshot);
  const onPersistedRestoreRef = useRef(onPersistedRestore);
  const onVersionLoadedRef = useRef(onVersionLoaded);
  const canAutoSaveRef = useRef(canAutoSave);
  getCanvasSnapshotRef.current = getCanvasSnapshot;
  onPersistedRestoreRef.current = onPersistedRestore;
  onVersionLoadedRef.current = onVersionLoaded;
  canAutoSaveRef.current = canAutoSave;

  const [state, { set, undo, redo, reset, canUndo, canRedo }] = useUndo<Adjustments>(
    { ...DEFAULT_ADJUSTMENTS },
    { useCheckpoints: true },
  );

  const [versionLoaded, setVersionLoaded] = useState(!imageId);

  // Load the most recent saved version when imageId changes.
  useEffect(() => {
    if (!imageId) {
      setVersionLoaded(true);
      return;
    }

    setVersionLoaded(false);
    fetch(`/api/images/versions?imageId=${imageId}`)
      .then((res) => res.json())
      .then((data: { versions?: Array<{ adjustments: unknown }> }) => {
        const latest = data.versions?.[0];
        const restored = latest
          ? parseVersionAdjustments(latest.adjustments)
          : defaultPersistedEditorState();
        reset(restored.sliders as Adjustments);
        lastSavedRef.current = { ...restored.sliders } as Adjustments;
        lastPersistedRef.current = restored;
        onPersistedRestoreRef.current?.(restored);
      })
      .catch((err) => {
        console.error("[useEditor] Failed to load saved editor state:", err);
        const fallback = defaultPersistedEditorState();
        onPersistedRestoreRef.current?.(fallback);
      })
      .finally(() => {
        setVersionLoaded(true);
        onVersionLoadedRef.current?.();
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageId]);

  const adjustments = state.present;
  const lastSavedRef = useRef<Adjustments>({ ...DEFAULT_ADJUSTMENTS });
  const lastPersistedRef = useRef<PersistedEditorState>(defaultPersistedEditorState());

  const isFirstPreviewRef = useRef(true);

  const setAdjustments = useCallback(
    (next: Adjustments, checkpoint?: boolean) => {
      if (adjustmentsEqual(next, state.present)) return;
      set(next, checkpoint);
    },
    [set, state.present],
  );

  const isDirtyRef = useRef(false);
  const adjustmentsRef = useRef<Adjustments>({ ...DEFAULT_ADJUSTMENTS });
  const imageIdRef = useRef(imageId);

  function buildCurrentPersistedState(): PersistedEditorState {
    const canvas = getCanvasSnapshotRef.current?.();
    return {
      sliders: { ...adjustmentsRef.current },
      transform: canvas?.transform ?? defaultPersistedEditorState().transform,
      workingImageUrl: canvas?.workingImageUrl ?? null,
      workingWidth: canvas?.workingWidth ?? null,
      workingHeight: canvas?.workingHeight ?? null,
    };
  }

  isDirtyRef.current = !persistedStatesEqual(
    buildCurrentPersistedState(),
    lastPersistedRef.current,
  );
  adjustmentsRef.current = adjustments;
  imageIdRef.current = imageId;

  const isDirty = isDirtyRef.current;

  const [justSaved, setJustSaved] = useState(false);
  const justSavedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const previewAdjustment = useCallback(
    (key: AdjustmentKey, value: number) => {
      const checkpoint = isFirstPreviewRef.current;
      isFirstPreviewRef.current = false;
      setAdjustments({ ...state.present, [key]: value } as Adjustments, checkpoint);
    },
    [setAdjustments, state.present],
  );

  const updateAdjustment = useCallback(
    (key: AdjustmentKey, value: number) => {
      isFirstPreviewRef.current = true;
      setAdjustments({ ...state.present, [key]: value } as Adjustments, false);
    },
    [setAdjustments, state.present],
  );

  const patchAdjustments = useCallback(
    (patch: Partial<Adjustments> & Partial<Record<string, number>>) => {
      isFirstPreviewRef.current = true;
      setAdjustments(normalizeAdjustments({ ...state.present, ...patch }) as Adjustments, true);
    },
    [setAdjustments, state.present],
  );

  const resetAdjustments = useCallback(() => {
    const defaults = { ...DEFAULT_ADJUSTMENTS } as Adjustments;
    reset(defaults);
    lastSavedRef.current = defaults;
    isFirstPreviewRef.current = true;
  }, [reset]);

  /** Apply a restored v2 snapshot to slider state without updating the saved baseline. */
  const restorePersistedState = useCallback(
    (state: PersistedEditorState) => {
      isFirstPreviewRef.current = true;
      reset(state.sliders as Adjustments);
      lastSavedRef.current = { ...state.sliders } as Adjustments;
    },
    [reset],
  );

  const saveVersion = useCallback(async (force = false): Promise<PersistedEditorState | null> => {
    const imgId = imageIdRef.current;
    if (!imgId) return null;
    if (!force && !canAutoSaveRef.current?.()) return null;

    const canvas = getCanvasSnapshotRef.current?.();
    const persisted = buildCurrentPersistedState();
    if (!force && persistedStatesEqual(persisted, lastPersistedRef.current)) {
      return null;
    }

    const payload: {
      imageId: string;
      adjustments: Record<string, unknown>;
      imageBase64?: string;
    } = {
      imageId: imgId,
      adjustments: serializePersistedEditorState(persisted),
    };

    if (canvas?.imageBase64) {
      payload.imageBase64 = canvas.imageBase64;
    }

    try {
      const res = await fetch("/api/images/versions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: !payload.imageBase64,
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = (await res.json()) as { version?: { adjustments: unknown } };
      const saved = data.version
        ? parseVersionAdjustments(data.version.adjustments)
        : persisted;
      lastSavedRef.current = { ...saved.sliders } as Adjustments;
      lastPersistedRef.current = saved;

      if (justSavedTimerRef.current) clearTimeout(justSavedTimerRef.current);
      setJustSaved(true);
      justSavedTimerRef.current = setTimeout(() => setJustSaved(false), 2000);
      return saved;
    } catch (err) {
      console.error("[useEditor] Auto-save failed:", err);
      return null;
    }
  }, []);

  useEffect(() => {
    if (!imageId) return;
    const intervalId = setInterval(() => void saveVersion(), 30_000);
    return () => {
      clearInterval(intervalId);
      if (isDirtyRef.current) void saveVersion(true);
    };
  }, [imageId, saveVersion]);

  useEffect(() => {
    return () => {
      if (justSavedTimerRef.current) clearTimeout(justSavedTimerRef.current);
    };
  }, []);

  const undoAdjustments = useCallback(() => {
    isFirstPreviewRef.current = true;
    undo();
  }, [undo]);

  const redoAdjustments = useCallback(() => {
    isFirstPreviewRef.current = true;
    redo();
  }, [redo]);

  return {
    adjustments,
    updateAdjustment,
    previewAdjustment,
    patchAdjustments,
    undo: undoAdjustments,
    redo: redoAdjustments,
    canUndo,
    canRedo,
    resetAdjustments,
    isDirty,
    justSaved,
    saveVersion,
    restorePersistedState,
    versionLoaded,
  };
}
