"use client";

import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { Icon } from "@/components/shared/Icon";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import {
  BTN_BRAND_SOLID,
  BTN_FORMAT_IDLE,
  BTN_MODAL_FORMAT_SELECTED,
} from "@/lib/button-styles";
import toast from "react-hot-toast";
import type { Adjustments } from "@/hooks/useEditor";
import type { ImageTransform } from "@/lib/image-transform";
import { buildPreviewRequestBody } from "@/lib/preview-request";

type ExportFormat = "jpeg" | "png" | "tiff";

interface ExportModalProps {
  open: boolean;
  onClose: () => void;
  imageId?: string;
  filename?: string;
  adjustments: Adjustments;
  /** The URL of the image currently on the canvas — may differ from the
   *  original if an AI operation (e.g. background removal) replaced it. */
  activeImageUrl?: string | null;
  imageBase64?: string | null;
  transform?: ImageTransform;
  originalUrl?: string | null;
  storedPreviewUrl?: string | null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function estimateSize(format: ExportFormat, quality: number): string {
  const base = 4 * 1024 * 1024;
  if (format === "tiff") return `~${formatBytes(base * 2)}`;
  if (format === "png") return `~${formatBytes(base * 0.8)}`;
  return `~${formatBytes(base * (quality / 100) * 0.4)}`;
}

export default function ExportModal({
  open,
  onClose,
  imageId,
  filename,
  adjustments,
  activeImageUrl,
  imageBase64,
  transform,
  originalUrl,
  storedPreviewUrl,
}: ExportModalProps) {
  const titleId = useId();
  const [format, setFormat] = useState<ExportFormat>("jpeg");
  const [quality, setQuality] = useState(90);
  const [pendingAction, setPendingAction] = useState<null | "download">(null);
  const [error, setError] = useState<string | null>(null);

  const loading = pendingAction !== null;

  useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape" && open && !loading) {
        onClose();
      }
    }
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [open, loading, onClose]);

  async function triggerExport() {
    if (!imageId) return;
    setPendingAction("download");
    setError(null);

    try {
      const previewBody = buildPreviewRequestBody({
        adjustments,
        originalUrl: originalUrl ?? null,
        storedPreviewUrl: storedPreviewUrl ?? null,
        baseImageUrl: activeImageUrl ?? null,
        imageBase64: imageBase64 ?? null,
        transform: transform ?? {
          rotation: 0,
          flipX: false,
          flipY: false,
          straighten: 0,
        },
      });

      const res = await fetch("/api/images/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageId,
          adjustments: previewBody.adjustments,
          format,
          quality,
          imageUrl: previewBody.imageUrl,
          imageBase64: previewBody.imageBase64,
          transform: previewBody.transform,
        }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Export failed");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const base = filename ? filename.replace(/\.[^.]+$/, "") : "export";
      a.download = `${base}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success("Image downloaded!");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setPendingAction(null);
    }
  }

  if (!open) {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="mx-4 w-full max-w-[480px] rounded-xl border border-[#262626] bg-[#121212] p-6 shadow-2xl"
      >
        {/* Header — same typography as Upload modal */}
        <div className="mb-5 flex items-center justify-between">
          <h2 id={titleId} className="text-[16px] font-medium text-white">
            Export Image
          </h2>
          <button
            type="button"
            disabled={loading}
            className="flex h-8 w-8 items-center justify-center rounded-md text-[#888888] hover:bg-[#1d1d1d] hover:text-white transition-colors cursor-pointer disabled:opacity-40"
            onClick={onClose}
          >
            <Icon name="XClose" size={16} aria-hidden />
          </button>
        </div>

        {/* Body inset — echoes upload “card” zones */}
        <div className="flex flex-col gap-4 rounded-xl border border-[#262626] bg-[#1d1d1d] p-4">
          <div className="flex flex-col gap-2">
            <span className="text-[12px] font-semibold text-[#888888]">
              Format
            </span>
            <div className="flex gap-[6px]">
              {(["jpeg", "png", "tiff"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFormat(f)}
                  className={
                    format === f ? BTN_MODAL_FORMAT_SELECTED : BTN_FORMAT_IDLE
                  }
                >
                  {f.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {format === "jpeg" && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-semibold text-[#888888]">
                  Quality
                </span>
                <span className="text-[13px] tabular-nums text-[#888888]">
                  {quality}
                </span>
              </div>
              <SliderPrimitive.Root
                min={1}
                max={100}
                step={1}
                value={[quality]}
                onValueChange={([v]) => setQuality(v)}
                className="relative flex w-full touch-none select-none items-center"
              >
                <SliderPrimitive.Track className="relative h-[2px] w-full grow rounded-full bg-white/[0.08]">
                  <SliderPrimitive.Range className="absolute h-full rounded-full bg-neutral-400" />
                </SliderPrimitive.Track>
                <SliderPrimitive.Thumb className="block h-[12px] w-[12px] rounded-full bg-[#e5e5e5] shadow-[0_0_0_1px_rgba(255,255,255,0.15)] outline-none cursor-pointer transition-transform hover:scale-110" />
              </SliderPrimitive.Root>
              <span className="text-[12px] text-[#555555]">
                Estimated size: {estimateSize(format, quality)}
              </span>
            </div>
          )}

          {format !== "jpeg" && (
            <span className="text-[12px] text-[#555555]">
              Estimated size: {estimateSize(format, quality)}
            </span>
          )}
        </div>

        {error && (
          <p className="mt-4 text-[13px] text-[#ef4444]">{error}</p>
        )}

        {/* Footer */}
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={() => void triggerExport()}
            disabled={loading || !imageId}
            className={BTN_BRAND_SOLID}
          >
            {pendingAction === "download" ? (
              <LoadingSpinner
                size="sm"
                variant="muted"
                label="Exporting"
                className="[&>span:first-child]:border-white/25 [&>span:first-child]:border-t-white/85"
              />
            ) : (
              <Icon name="Download01" size={16} aria-hidden />
            )}
            {pendingAction === "download" ? "Exporting…" : "Download"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
