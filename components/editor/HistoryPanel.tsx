"use client";

import { useEffect, useState } from "react";
import { X, RotateCcw, Clock } from "lucide-react";
import type { Adjustments } from "@/hooks/useEditor";

interface ImageVersion {
  id: string;
  imageId: string;
  adjustments: Adjustments;
  label: string | null;
  createdAt: string;
}

interface HistoryPanelProps {
  open: boolean;
  onClose: () => void;
  imageId?: string;
  onRestore: (adjustments: Partial<Adjustments>) => void;
}

function formatRelative(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function HistoryPanel({
  open,
  onClose,
  imageId,
  onRestore,
}: HistoryPanelProps) {
  const [versions, setVersions] = useState<ImageVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !imageId) return;
    setLoading(true);
    fetch(`/api/images/versions?imageId=${imageId}`)
      .then((res) => res.json())
      .then((data: { versions?: ImageVersion[] }) => {
        setVersions(data.versions ?? []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [open, imageId]);

  function handleRestore(version: ImageVersion) {
    setRestoringId(version.id);
    onRestore(version.adjustments);
    setTimeout(() => setRestoringId(null), 600);
  }

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-30"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 bottom-0 z-40 w-[280px] bg-black/50 backdrop-blur-xl border-l border-white/[0.07] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 h-[44px] border-b border-white/[0.07] shrink-0">
          <div className="flex items-center gap-2">
            <Clock size={13} strokeWidth={1.75} className="text-[#888888]" />
            <span className="text-[12px] font-medium uppercase tracking-widest text-[#888888]">
              History
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[#888888] hover:text-white transition-colors cursor-pointer"
          >
            <X size={15} strokeWidth={1.5} />
          </button>
        </div>

        {/* Version list */}
        <div className="scrollbar-subtle flex-1 overflow-y-auto min-h-0">
          {loading && (
            <div className="flex items-center justify-center h-24">
              <span className="text-[12px] text-[#555555]">Loading…</span>
            </div>
          )}

          {!loading && versions.length === 0 && (
            <div className="flex flex-col items-center justify-center h-32 gap-2 px-4 text-center">
              <Clock size={20} strokeWidth={1.25} className="text-[#333333]" />
              <p className="text-[12px] text-[#555555] leading-relaxed">
                No saved versions yet
              </p>
              <p className="text-[11px] text-[#444444] leading-relaxed">
                Versions are saved automatically every 30 seconds when changes are made.
              </p>
            </div>
          )}

          {!loading &&
            versions.map((version, idx) => (
              <div
                key={version.id}
                className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] hover:bg-white/[0.04] transition-colors group"
              >
                <div className="flex flex-col gap-[2px] min-w-0">
                  <span className="text-[12px] text-[#e5e5e5]">
                    {version.label ?? `Version ${versions.length - idx}`}
                  </span>
                  <span className="text-[11px] text-[#555555]">
                    {formatRelative(version.createdAt)}
                  </span>
                </div>
                <button
                  onClick={() => handleRestore(version)}
                  disabled={restoringId === version.id}
                  className="flex items-center gap-[5px] h-[26px] px-3 rounded-lg bg-white/[0.05] border border-white/[0.08] text-[11px] text-white hover:bg-white/[0.09] transition-colors cursor-pointer disabled:opacity-50 shrink-0 ml-3"
                >
                  <RotateCcw size={10} strokeWidth={2} />
                  {restoringId === version.id ? "…" : "Restore"}
                </button>
              </div>
            ))}
        </div>
      </div>
    </>
  );
}
