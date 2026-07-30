"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/shared/Icon";
import EmptyState from "@/components/shared/EmptyState";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";

interface ImageVersion {
  id: string;
  imageId: string;
  adjustments: unknown;
  label: string | null;
  createdAt: string;
}

interface HistoryVersionListProps {
  imageId?: string;
  enabled: boolean;
  onRestore: (adjustments: unknown) => void | Promise<void>;
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

export function HistoryVersionList({
  imageId,
  enabled,
  onRestore,
}: HistoryVersionListProps) {
  const [versions, setVersions] = useState<ImageVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !imageId) return;
    setLoading(true);
    fetch(`/api/images/versions?imageId=${imageId}`)
      .then((res) => res.json())
      .then((data: { versions?: ImageVersion[] }) => {
        setVersions(data.versions ?? []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [enabled, imageId]);

  function handleRestore(version: ImageVersion) {
    setRestoringId(version.id);
    void Promise.resolve(onRestore(version.adjustments)).finally(() => {
      setRestoringId(null);
    });
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto" data-panel-scroll>
      {loading && (
        <div className="flex h-24 items-center justify-center">
          <LoadingSpinner size="sm" label="Loading version history" />
        </div>
      )}

      {!loading && versions.length === 0 && (
        <EmptyState
          className="h-32 px-6"
          icon="ClockRewind"
          message="No saved versions yet"
          description="Versions are saved automatically every 30 seconds when changes are made."
        />
      )}

      {!loading &&
        versions.map((version, idx) => (
          <div
            key={version.id}
            className="group flex items-center justify-between border-b border-[#2e2e2e] px-6 py-3.5 transition-colors hover:bg-[#1d1d1d]"
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
              type="button"
              onClick={() => handleRestore(version)}
              disabled={restoringId === version.id}
              className="ml-3 flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-[#2e2e2e] bg-[#1d1d1d] px-4 text-[13px] text-white hover:border-[#3a3a3a] transition-colors disabled:opacity-50"
            >
              <Icon name="FlipBackward" size={16} aria-hidden />
              {restoringId === version.id ? "…" : "Restore"}
            </button>
          </div>
        ))}
    </div>
  );
}
