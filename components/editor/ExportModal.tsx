"use client";

import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { X, Download, BookImage, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import type { Adjustments } from "@/hooks/useEditor";

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
}

const successToastStyle = {
  background: "rgba(15, 10, 25, 0.9)",
  color: "#ffffff",
  border: "1px solid rgba(255,255,255,0.1)",
  fontSize: "12px",
} as const;

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
}: ExportModalProps) {
  const titleId = useId();
  const [format, setFormat] = useState<ExportFormat>("jpeg");
  const [quality, setQuality] = useState(90);
  const [pendingAction, setPendingAction] = useState<
    null | "download" | "save"
  >(null);
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

  async function triggerExport(action: "download" | "save") {
    if (!imageId) return;
    setPendingAction(action);
    setError(null);

    try {
      const res = await fetch("/api/images/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageId,
          adjustments,
          format,
          quality,
          imageUrl: activeImageUrl ?? undefined,
        }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Export failed");
      }

      if (action === "download") {
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

        toast.success("Image downloaded!", {
          style: successToastStyle,
        });
        onClose();
      } else {
        toast.success("Saved to library!", {
          style: successToastStyle,
        });
        onClose();
      }
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
        className="mx-4 w-full max-w-[480px] rounded-2xl border border-white/[0.1] bg-[#111111] p-6 shadow-2xl"
      >
        {/* Header — same typography as Upload modal */}
        <div className="mb-5 flex items-center justify-between">
          <h2 id={titleId} className="text-[16px] font-medium text-white">
            Export Image
          </h2>
          <button
            type="button"
            disabled={loading}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[#888888] hover:bg-white/[0.07] hover:text-white transition-colors cursor-pointer disabled:opacity-40"
            onClick={onClose}
          >
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>

        {/* Body inset — echoes upload “card” zones */}
        <div className="flex flex-col gap-4 rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
          <div className="flex flex-col gap-2">
            <span className="text-[12px] uppercase tracking-wider text-[#555555]">
              Format
            </span>
            <div className="flex gap-[6px]">
              {(["jpeg", "png", "tiff"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFormat(f)}
                  className={[
                    "flex-1 h-9 rounded-lg border text-[13px] font-medium uppercase tracking-wide transition-all cursor-pointer",
                    format === f
                      ? "bg-gradient-to-r from-[#682FBF] to-[#8B44E8] text-white border-transparent shadow-glow-sm"
                      : "border-white/[0.08] bg-white/[0.05] text-white/80 hover:bg-white/[0.09] hover:border-white/[0.15]",
                  ].join(" ")}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {format === "jpeg" && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[12px] uppercase tracking-wider text-[#555555]">
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

        {/* Footer — same rhythm as Upload: justify-between mt-5, gradient CTA */}
        <div className="mt-5 flex items-center justify-between">
          <button
            type="button"
            onClick={() => void triggerExport("save")}
            disabled={loading || !imageId}
            className="flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.05] px-4 text-[13px] font-medium text-white/90 hover:bg-white/[0.09] transition-colors disabled:cursor-not-allowed disabled:opacity-40"
          >
            {pendingAction === "save" ? (
              <Loader2 size={14} strokeWidth={2} className="shrink-0 animate-spin" />
            ) : (
              <BookImage size={14} strokeWidth={1.75} />
            )}
            Save to library
          </button>
          <button
            type="button"
            onClick={() => void triggerExport("download")}
            disabled={loading || !imageId}
            className="flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-gradient-to-r from-[#682FBF] to-[#8B44E8] px-4 text-[13px] font-medium text-white shadow-glow-sm transition-shadow duration-300 hover:shadow-glow disabled:cursor-not-allowed disabled:opacity-40"
          >
            {pendingAction === "download" ? (
              <Loader2 size={14} strokeWidth={2} className="shrink-0 animate-spin" />
            ) : (
              <Download size={14} strokeWidth={2} />
            )}
            {pendingAction === "download" ? "Exporting…" : "Download"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
