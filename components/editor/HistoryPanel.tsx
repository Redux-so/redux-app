"use client";

import { useEffect, useState } from "react";
import { X, RotateCcw, Clock } from "lucide-react";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
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
      <div className="fixed right-0 top-0 bottom-0 z-40 flex w-[400px] flex-col border-l border-white/[0.07] bg-surface-chrome shadow-2xl">
        {/* Header */}
        <div className="flex h-[52px] shrink-0 items-center justify-between border-b border-white/[0.07] px-6">
          <div className="flex items-center gap-2">
            <Clock size={14} strokeWidth={1.75} className="text-[#888888]" />
            <span className="text-[14px] font-medium uppercase tracking-widest text-[#888888]">
              History
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[#888888] hover:bg-white/[0.07] hover:text-white transition-colors cursor-pointer"
          >
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>

        {/* Version list */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading && (
            <div className="flex h-24 items-center justify-center">
              <LoadingSpinner size="sm" label="Loading version history" />
            </div>
          )}

          {!loading && versions.length === 0 && (
            <div className="flex h-32 flex-col items-center justify-center gap-2 px-6 text-center">
              <Clock size={24} strokeWidth={1.25} className="text-[#333333]" />
              <p className="text-[13px] leading-relaxed text-[#555555]">
                No saved versions yet
              </p>
              <p className="text-[12px] leading-relaxed text-[#444444]">
                Versions are saved automatically every 30 seconds when changes are made.
              </p>
            </div>
          )}

          {!loading &&
            versions.map((version, idx) => (
              <div
                key={version.id}
                className="group flex items-center justify-between border-b border-white/[0.06] px-6 py-3.5 transition-colors hover:bg-white/[0.04]"
              >
                <div className="flex min-w-0 flex-col gap-[2px]">
                  <span className="text-[14px] text-[#e5e5e5]">
                    {version.label ?? `Version ${versions.length - idx}`}
                  </span>
                  <span className="text-[12px] text-[#555555]">
                    {formatRelative(version.createdAt)}
                  </span>
                </div>
                <button
                  onClick={() => handleRestore(version)}
                  disabled={restoringId === version.id}
                  className="ml-3 flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.05] px-4 text-[13px] text-white hover:bg-white/[0.09] transition-colors disabled:opacity-50"
                >
                  <RotateCcw size={14} strokeWidth={2} />
                  {restoringId === version.id ? "…" : "Restore"}
                </button>
              </div>
            ))}
        </div>
      </div>
    </>
  );
}
