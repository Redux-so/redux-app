"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createEditorOperations } from "@/lib/editor-operations";
import { DEFAULT_ADJUSTMENTS, normalizeAdjustments, type AdjustmentKey, type Adjustments as SliderAdjustments } from "@/constants/adjustments";
import {
  defaultPersistedEditorState,
  parseVersionAdjustments,
  persistedStatesEqual,
  serializePersistedEditorState,
  type PersistedEditorState,
} from "@/lib/editor-state";
import { recordLibraryPreviewUpdate } from "@/lib/library-preview-sync";
import {
  appendEditorHistory, createEditorTimeline, parseEditorTimeline, serializeEditorTimeline,
  type EditorHistoryState, type EditorTimeline, type SavedEditorVersion,
} from "@/lib/editor-history";
export type { EditorHistoryState } from "@/lib/editor-history";

export type Adjustments = SliderAdjustments;

export interface UseEditorOptions {
  canAutoSave?: () => boolean;
  renderCover?: (state: PersistedEditorState) => Promise<string>;
}

let lastSaveGeneration = 0;
function nextSaveGeneration(): number {
  lastSaveGeneration = Math.max(Date.now() * 1000, lastSaveGeneration + 1);
  return lastSaveGeneration;
}

export function useEditor(imageId?: string, options: UseEditorOptions = {}) {
  const renderCoverRef = useRef(options.renderCover);
  renderCoverRef.current = options.renderCover;
  const canAutoSaveRef = useRef(options.canAutoSave);
  canAutoSaveRef.current = options.canAutoSave;

  const [timeline, setTimeline] = useState<EditorTimeline>(createEditorTimeline);
  const timelineRef = useRef(timeline);
  const historyRevisionRef = useRef(0);
  const lastSavedHistoryRevisionRef = useRef(0);
  const currentRef = useRef(timeline.entries[timeline.cursor].state);
  const publishTimeline = useCallback((next: EditorTimeline) => {
    timelineRef.current = next;
    currentRef.current = next.entries[next.cursor].state;
    setTimeline(next);
  }, []);
  const [savedVersions, setSavedVersions] = useState<SavedEditorVersion[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const uploadedSourcesRef = useRef(new Map<string, string>());
  const historyReadyRef = useRef(true);
  const operationsRef = useRef<ReturnType<typeof createEditorOperations> | null>(null);
  if (!operationsRef.current) operationsRef.current = createEditorOperations();
  const beginOperation = useCallback(() => operationsRef.current!.begin(), []);
  const prepareExportState = useCallback(async () => {
    await operationsRef.current!.waitForIdle();
    if (!historyReadyRef.current) throw new Error("Reload the image before editing its history");
    if (!mountedRef.current) throw new Error("The editor was closed.");
    const current = currentRef.current;
    if (current.masks && Object.values(current.masks).some((paths) => paths.length > 0)) {
      throw new Error("Confirm or cancel your painted mask before exporting.");
    }
    return { ...current, sliders: { ...current.sliders }, transform: { ...current.transform } };
  }, []);
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
  const commitState = useCallback((patch: Partial<EditorHistoryState>, checkpoint = true, label?: string) => {
    const next = { ...currentRef.current, ...patch };
    const previousMasks = currentRef.current.masks;
    const masksEqual = (["heal", "eraser", "blur"] as const).every((tool) => {
      const before = previousMasks?.[tool] ?? [];
      const after = next.masks?.[tool] ?? [];
      return before.length === after.length && before.every((path, index) => path === after[index]);
    });
    if (persistedStatesEqual(next, currentRef.current) && masksEqual) return false;
    revisionRef.current++;
    if (!persistedStatesEqual(next, currentRef.current)) historyRevisionRef.current++;
    publishTimeline(appendEditorHistory(timelineRef.current, next, checkpoint, label));
    return true;
  }, [publishTimeline]);

  const [versionLoaded, setVersionLoaded] = useState(!imageId);

  // Load the most recent saved version when imageId changes.
  useEffect(() => {
    if (!imageId) {
      setVersionLoaded(true);
      return;
    }

    setVersionLoaded(false);
    historyReadyRef.current = false;
    let cancelled = false;
    const revision = revisionRef;
    revision.current++;
    fetch(`/api/images/versions?imageId=${imageId}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Could not load history (${res.status})`);
        return res.json();
      })
      .then(
        (data: {
          autosave?: { adjustments: unknown } | null;
          versions?: SavedEditorVersion[];
        }) => {
          if (cancelled) return;
          const latest = data.autosave ?? data.versions?.[0];
          const restored = parseEditorTimeline(latest?.adjustments);
          publishTimeline(restored);
          setSavedVersions(data.versions ?? []);
          setHistoryError(null);
          historyReadyRef.current = true;
          lastPersistedRef.current = restored.entries[restored.cursor].state;
          historyRevisionRef.current = 0;
          lastSavedHistoryRevisionRef.current = 0;
        },
      )
      .catch((err) => {
        if (cancelled) return;
        console.error("[useEditor] Failed to load saved editor state:", err);
        publishTimeline(createEditorTimeline());
        setHistoryError("Could not load your saved history. Reload before editing to avoid losing it.");
      })
      .finally(() => {
        if (cancelled) return;
        setVersionLoaded(true);
      });
    return () => { cancelled = true; };
  }, [imageId, publishTimeline]);

  const adjustments = timeline.entries[timeline.cursor].state.sliders;
  const lastPersistedRef = useRef<PersistedEditorState>(defaultPersistedEditorState());

  const isFirstPreviewRef = useRef(true);

  const setAdjustments = useCallback(
    (next: Adjustments, checkpoint = true, label?: string) => commitState({ sliders: next }, checkpoint, label),
    [commitState],
  );

  const isDirtyRef = useRef(false);
  const imageIdRef = useRef(imageId);

  function buildCurrentPersistedState(): PersistedEditorState {
    const current = currentRef.current;
    return { ...current, sliders: { ...current.sliders }, transform: { ...current.transform } };
  }

  imageIdRef.current = imageId;
  isDirtyRef.current = !persistedStatesEqual(buildCurrentPersistedState(), lastPersistedRef.current) ||
    historyRevisionRef.current !== lastSavedHistoryRevisionRef.current;
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
      const timeline = timelineRef.current;
      if (timeline.cursor > 0 && persistedStatesEqual(timeline.entries[timeline.cursor - 1].state, currentRef.current)) {
        historyRevisionRef.current++;
        publishTimeline({ entries: timeline.entries.slice(0, timeline.cursor), cursor: timeline.cursor - 1 });
      }
    },
    [setAdjustments, publishTimeline],
  );

  const patchAdjustments = useCallback(
    (patch: Partial<Adjustments> & Partial<Record<string, number>>, label = "AI adjustments applied") => {
      isFirstPreviewRef.current = true;
      return setAdjustments(normalizeAdjustments({ ...currentRef.current.sliders, ...patch }) as Adjustments, true, label);
    },
    [setAdjustments],
  );

  const resetAdjustments = useCallback(() => {
    const defaults = { ...DEFAULT_ADJUSTMENTS } as Adjustments;
    commitState({ sliders: defaults }, true, "Adjustments reset");
    isFirstPreviewRef.current = true;
  }, [commitState]);

  /** Revert appends a full snapshot and keeps the existing version list. */
  const restorePersistedState = useCallback(
    (state: PersistedEditorState, label = "Version reverted") => {
      isFirstPreviewRef.current = true;
      chatRequestRef.current++;
      const timeline = timelineRef.current;
      if (timeline.cursor < timeline.entries.length - 1) {
        revisionRef.current++;
        historyRevisionRef.current++;
        publishTimeline({ ...timeline, cursor: timeline.entries.length - 1 });
      }
      commitState({ ...state, masks: undefined }, true, label);
    },
    [commitState, publishTimeline],
  );

  const saveQueueRef = useRef<Promise<unknown>>(Promise.resolve());

  const saveVersion = useCallback(async (force = false): Promise<PersistedEditorState | null> => {
    const imgId = imageIdRef.current;
    if (!imgId || !historyReadyRef.current || (!force && !isFirstPreviewRef.current)) return null;
    if (canAutoSaveRef.current && !canAutoSaveRef.current()) return null;

    const persisted = buildCurrentPersistedState();
    const history = serializeEditorTimeline(timelineRef.current);
    const historyRevision = historyRevisionRef.current;
    const revision = revisionRef.current;
    if (!force && persistedStatesEqual(persisted, lastPersistedRef.current) && historyRevision === lastSavedHistoryRevisionRef.current) {
      return null;
    }

    const payload: {
      imageId: string;
      adjustments: Record<string, unknown>;
      coverBase64?: string;
      saveGeneration: number;
      history: Record<string, unknown>;
      historyImages: string[];
    } = {
      imageId: imgId,
      history,
      historyImages: [],
      saveGeneration: nextSaveGeneration(),
      adjustments: serializePersistedEditorState(persisted),
    };

    const inlineSources = new Map<string, string>();
    const resolveSource = (source: string | null): string | null => {
      if (!source?.startsWith("data:")) return source;
      const uploaded = uploadedSourcesRef.current.get(source);
      if (uploaded) return uploaded;
      if (!inlineSources.has(source)) {
        inlineSources.set(source, `history-image:${payload.historyImages.length}`);
        payload.historyImages.push(source.split(",")[1]);
      }
      return inlineSources.get(source)!;
    };
    payload.adjustments.workingImageUrl = resolveSource(persisted.workingImageUrl);
    for (const entry of history.entries as Array<{ state: Record<string, unknown> }>) {
      entry.state.workingImageUrl = resolveSource(entry.state.workingImageUrl as string | null);
    }

    const save = async () => {
      if (imgId !== imageIdRef.current || revision !== revisionRef.current) return null;
      try {
        // Multiple native crops can exceed one request's size ceiling. Upload each
        // source separately, then publish the timeline and cover in the final save.
        if (payload.historyImages.reduce((size, source) => size + source.length, 0) > 44 * 1024 * 1024) {
          const resolved = new Map<string, string>();
          for (const [source, token] of inlineSources) {
            let url = uploadedSourcesRef.current.get(source);
            if (!url) {
              const upload = await fetch("/api/images/versions", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ imageId: imgId, adjustments: {}, sourceOnly: true, imageBase64: source.split(",")[1] }),
              });
              if (!upload.ok) throw new Error("Could not save a history image");
              const data = await upload.json() as { sourceUrl: string };
              url = data.sourceUrl;
              uploadedSourcesRef.current.set(source, url);
            }
            resolved.set(token, url);
          }
          const replaceToken = (source: unknown) => typeof source === "string" ? resolved.get(source) ?? source : source;
          payload.adjustments.workingImageUrl = replaceToken(payload.adjustments.workingImageUrl);
          for (const entry of history.entries as Array<{ state: Record<string, unknown> }>) {
            entry.state.workingImageUrl = replaceToken(entry.state.workingImageUrl);
          }
          payload.historyImages = [];
          inlineSources.clear();
        }
        if (renderCoverRef.current) payload.coverBase64 = await renderCoverRef.current(persisted);
        const res = await fetch("/api/images/versions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          keepalive: !payload.historyImages.length && !payload.coverBase64,
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = (await res.json()) as { version?: { adjustments: unknown }; previewUrl?: string; stale?: boolean; historySources?: string[] };
        if (data.stale) return null;
        for (const [source, token] of inlineSources) {
          const url = data.historySources?.[Number(token.split(":")[1])];
          if (url) uploadedSourcesRef.current.set(source, url);
        }
        if (data.previewUrl) recordLibraryPreviewUpdate(imgId, data.previewUrl, payload.saveGeneration);
        const saved = data.version
          ? parseVersionAdjustments(data.version.adjustments)
          : persisted;
        if (revision !== revisionRef.current || imgId !== imageIdRef.current) return null;
        if (!mountedRef.current) return saved;
        lastPersistedRef.current = persisted;
        lastSavedHistoryRevisionRef.current = historyRevision;

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

  const selectHistory = useCallback((id: string) => {
    const current = timelineRef.current;
    const cursor = current.entries.findIndex((entry) => entry.id === id);
    if (cursor < 0 || cursor === current.cursor) return;
    isFirstPreviewRef.current = true;
    revisionRef.current++;
    chatRequestRef.current++;
    const visibleId = (end: number) => current.entries.slice(0, end + 1).filter((entry) => !entry.draft).at(-1)?.id;
    if (visibleId(cursor) !== visibleId(current.cursor)) historyRevisionRef.current++;
    publishTimeline({ ...current, cursor });
  }, [publishTimeline]);

  const undoAdjustments = useCallback(() => {
    const current = timelineRef.current;
    if (current.cursor > 0) selectHistory(current.entries[current.cursor - 1].id);
  }, [selectHistory]);
  const redoAdjustments = useCallback(() => {
    const current = timelineRef.current;
    if (current.cursor < current.entries.length - 1) selectHistory(current.entries[current.cursor + 1].id);
  }, [selectHistory]);


  return {
    adjustments,
    editorState: timeline.entries[timeline.cursor].state,
    historyEntries: timeline.entries.filter((entry) => !entry.draft),
    currentHistoryId: timeline.entries.slice(0, timeline.cursor + 1).filter((entry) => !entry.draft).at(-1)!.id,
    selectHistory,
    savedVersions,
    historyError,
    beginOperation,
    prepareExportState,
    commitState,
    createEditGuard,
    createChatEditGuard,
    getEditorRevision: () => revisionRef.current,
    getEditorState: () => currentRef.current,
    updateAdjustment,
    previewAdjustment,
    patchAdjustments,
    undo: undoAdjustments,
    redo: redoAdjustments,
    canUndo: timeline.cursor > 0,
    canRedo: timeline.cursor < timeline.entries.length - 1,
    resetAdjustments,
    isDirty,
    justSaved,
    saveVersion,
    restorePersistedState,
    versionLoaded,
  };
}
