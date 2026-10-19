"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import useUndo from "use-undo";
import { DEFAULT_ADJUSTMENTS, normalizeAdjustments, type AdjustmentKey, type Adjustments as SliderAdjustments } from "@/constants/adjustments";
import {
  defaultPersistedEditorState,
  parseVersionAdjustments,
  persistedStatesEqual,
  serializePersistedEditorState,
  type PersistedEditorState,
} from "@/lib/editor-state";
import type { CanvasMasks } from "@/hooks/useCanvas";

export type Adjustments = SliderAdjustments;

export interface UseEditorOptions {
  canAutoSave?: () => boolean;
}

export interface EditorHistoryState extends PersistedEditorState {
  masks?: CanvasMasks;
}

export function useEditor(imageId?: string, options: UseEditorOptions = {}) {
  const canAutoSaveRef = useRef(options.canAutoSave);
  canAutoSaveRef.current = options.canAutoSave;

  const [state, { set, undo, redo, reset, canUndo, canRedo }] = useUndo<EditorHistoryState>(
    defaultPersistedEditorState(),
    { useCheckpoints: true },
  );

  const currentRef = useRef(state.present);
  const revisionRef = useRef(0);
  const mountedRef = useRef(true);
  const requestRef = useRef(0);
  const chatRequestRef = useRef(0);
  // Agent patches merge into the latest state rather than restoring their request snapshot.
  const createChatEditGuard = useCallback(() => {
    const request = ++chatRequestRef.current;
    return () => mountedRef.current && request === chatRequestRef.current;
  }, []);
  const createEditGuard = useCallback(() => {
    const revision = revisionRef.current;
    const request = ++requestRef.current;
    return () => mountedRef.current && revision === revisionRef.current && request === requestRef.current;
  }, []);
  const commitState = useCallback((patch: Partial<EditorHistoryState>, checkpoint = true) => {
    const next = { ...currentRef.current, ...patch };
    const previousMasks = currentRef.current.masks;
    const masksEqual = (["heal", "eraser", "blur"] as const).every((tool) => {
      const before = previousMasks?.[tool] ?? [];
      const after = next.masks?.[tool] ?? [];
      return before.length === after.length && before.every((path, index) => path === after[index]);
    });
    if (persistedStatesEqual(next, currentRef.current) && masksEqual) return false;
    currentRef.current = next;
    revisionRef.current++;
    set(next, checkpoint);
    return true;
  }, [set]);

  const [versionLoaded, setVersionLoaded] = useState(!imageId);

  // Load the most recent saved version when imageId changes.
  useEffect(() => {
    if (!imageId) {
      setVersionLoaded(true);
      return;
    }

    setVersionLoaded(false);
    let cancelled = false;
    const revision = revisionRef;
    revision.current++;
    fetch(`/api/images/versions?imageId=${imageId}`)
      .then((res) => res.json())
      .then(
        (data: {
          autosave?: { adjustments: unknown } | null;
          versions?: Array<{ adjustments: unknown }>;
        }) => {
          if (cancelled) return;
          const latest = data.autosave ?? data.versions?.[0];
          const restored = latest
            ? parseVersionAdjustments(latest.adjustments)
            : defaultPersistedEditorState();
          currentRef.current = restored;
          reset(restored);
          lastPersistedRef.current = restored;
        },
      )
      .catch((err) => {
        if (cancelled) return;
        console.error("[useEditor] Failed to load saved editor state:", err);
        const fallback = defaultPersistedEditorState();
        currentRef.current = fallback;
        reset(fallback);
      })
      .finally(() => {
        if (cancelled) return;
        setVersionLoaded(true);
      });
    return () => { cancelled = true; };
  }, [imageId, reset]);

  const adjustments = state.present.sliders;
  const lastPersistedRef = useRef<PersistedEditorState>(defaultPersistedEditorState());

  const isFirstPreviewRef = useRef(true);

  const setAdjustments = useCallback(
    (next: Adjustments, checkpoint = true) => commitState({ sliders: next }, checkpoint),
    [commitState],
  );

  const isDirtyRef = useRef(false);
  const imageIdRef = useRef(imageId);

  function buildCurrentPersistedState(): PersistedEditorState {
    const current = currentRef.current;
    return { ...current, sliders: { ...current.sliders }, transform: { ...current.transform } };
  }

  imageIdRef.current = imageId;
  isDirtyRef.current = !persistedStatesEqual(buildCurrentPersistedState(), lastPersistedRef.current);
  const isDirty = isDirtyRef.current;

  const [justSaved, setJustSaved] = useState(false);
  const justSavedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const previewAdjustment = useCallback(
    (key: AdjustmentKey, value: number) => {
      if (currentRef.current.sliders[key] === value) return;
      const checkpoint = isFirstPreviewRef.current;
      isFirstPreviewRef.current = false;
      setAdjustments({ ...currentRef.current.sliders, [key]: value } as Adjustments, checkpoint);
    },
    [setAdjustments],
  );

  const updateAdjustment = useCallback(
    (key: AdjustmentKey, value: number) => {
      const checkpoint = isFirstPreviewRef.current;
      isFirstPreviewRef.current = true;
      setAdjustments({ ...currentRef.current.sliders, [key]: value } as Adjustments, checkpoint);
    },
    [setAdjustments],
  );

  const patchAdjustments = useCallback(
    (patch: Partial<Adjustments> & Partial<Record<string, number>>) => {
      isFirstPreviewRef.current = true;
      return setAdjustments(normalizeAdjustments({ ...currentRef.current.sliders, ...patch }) as Adjustments, true);
    },
    [setAdjustments],
  );

  const resetAdjustments = useCallback(() => {
    const defaults = { ...DEFAULT_ADJUSTMENTS } as Adjustments;
    commitState({ sliders: defaults });
    isFirstPreviewRef.current = true;
  }, [commitState]);

  /** Restoring a saved version is an undoable edit, not a history reset. */
  const restorePersistedState = useCallback(
    (state: PersistedEditorState) => {
      isFirstPreviewRef.current = true;
      commitState({ ...state, masks: undefined });
    },
    [commitState],
  );

  const saveQueueRef = useRef<Promise<unknown>>(Promise.resolve());

  const saveVersion = useCallback(async (force = false): Promise<PersistedEditorState | null> => {
    const imgId = imageIdRef.current;
    if (!imgId) return null;
    if (!force && !canAutoSaveRef.current?.()) return null;

    const persisted = buildCurrentPersistedState();
    const revision = revisionRef.current;
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

    if (persisted.workingImageUrl?.startsWith("data:")) {
      payload.imageBase64 = persisted.workingImageUrl.split(",")[1];
      payload.adjustments.workingImageUrl = null;
    }

    const save = async () => {
      if (imgId !== imageIdRef.current || revision !== revisionRef.current) return null;
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
        if (revision !== revisionRef.current || imgId !== imageIdRef.current) return null;
        if (!mountedRef.current) return saved;
        lastPersistedRef.current = persisted;

        if (justSavedTimerRef.current) clearTimeout(justSavedTimerRef.current);
        setJustSaved(true);
        justSavedTimerRef.current = setTimeout(() => setJustSaved(false), 2000);
        return saved;
      } catch (err) {
        console.error("[useEditor] Auto-save failed:", err);
        return null;
      }
    };
    const pending = saveQueueRef.current.then(save, save);
    saveQueueRef.current = pending;
    return pending;
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
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (justSavedTimerRef.current) clearTimeout(justSavedTimerRef.current);
    };
  }, []);

  const undoAdjustments = useCallback(() => {
    isFirstPreviewRef.current = true;
    revisionRef.current++;
    currentRef.current = state.past.at(-1) ?? currentRef.current;
    undo();
  }, [undo, state.past]);

  const redoAdjustments = useCallback(() => {
    isFirstPreviewRef.current = true;
    revisionRef.current++;
    currentRef.current = state.future[0] ?? currentRef.current;
    redo();
  }, [redo, state.future]);

  return {
    adjustments,
    editorState: state.present,
    commitState,
    createEditGuard,
    createChatEditGuard,
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
