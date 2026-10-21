"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { SURFACE_BORDER, SURFACE_SECONDARY_BTN } from "@/lib/surface-colors";
import { serializePersistedEditorState } from "@/lib/editor-state";
import type { EditorHistoryEntry, SavedEditorVersion } from "@/lib/editor-history";

export interface HistoryPanelProps {
  entries: EditorHistoryEntry[];
  currentId: string;
  versions: SavedEditorVersion[];
  ready: boolean;
  error: string | null;
  onRevert: (adjustments: unknown, label: string) => Promise<void>;
}

export function HistoryVersionList({ entries, currentId, versions, ready, error, onRevert }: HistoryPanelProps) {
  const [revertingId, setRevertingId] = useState<string | null>(null);
  if (error) return <p role="alert" className="px-6 py-5 text-sm text-white/60">{error}</p>;
  if (!ready) return <div className="flex justify-center py-8"><LoadingSpinner size="sm" label="Loading history" /></div>;

  // Existing checkpoints and new automatic versions share one chronological list.
  const rows = [
    ...versions.map((version) => ({ ...version, id: `saved:${version.id}` })),
    ...entries.filter((entry) => entry.id !== "original").map((entry) => ({
      id: entry.id, createdAt: entry.createdAt, adjustments: serializePersistedEditorState(entry.state),
    })),
  ].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const original = entries.find((entry) => entry.id === "original");
  const numbered = rows.map((row, index) => ({ ...row, title: `Version ${index + 1}` }));
  if (original) numbered.unshift({ id: original.id, createdAt: "", title: "Original", adjustments: serializePersistedEditorState(original.state) });

  async function revert(id: string, adjustments: unknown, title: string) {
    if (revertingId) return;
    setRevertingId(id);
    try { await onRevert(adjustments, title); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Could not revert to this version"); }
    finally { setRevertingId(null); }
  }

  return <div className="min-h-0 flex-1 overflow-y-auto" data-panel-scroll>
    <ol aria-label="Version history">{numbered.reverse().map((version) => <li key={version.id}
      className={`flex items-center justify-between gap-3 border-b px-6 py-4 ${SURFACE_BORDER}`}>
      <div className="min-w-0">
        <span className="block text-sm text-white/90">{version.title}</span>
        {version.createdAt && <time dateTime={version.createdAt} className="mt-1 block text-xs text-white/40">
          {new Date(version.createdAt).toLocaleString()}
        </time>}
      </div>
      {version.id === currentId ? <span className="flex h-8 w-16 shrink-0 items-center justify-center text-xs text-white/40" aria-current="true">Current</span> :
        <button type="button" disabled={!!revertingId}
          onClick={() => void revert(version.id, version.adjustments, version.title)}
          aria-label={`Revert to ${version.title}`}
          className={`flex h-8 w-16 shrink-0 items-center justify-center rounded-md px-3 text-[13px] disabled:opacity-40 ${SURFACE_SECONDARY_BTN}`}>
          {revertingId === version.id ? <LoadingSpinner size="xs" label="Reverting version" /> : "Revert"}
        </button>}
    </li>)}</ol>
  </div>;
}
