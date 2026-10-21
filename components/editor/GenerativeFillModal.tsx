"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/shared/Icon";
import EmptyState from "@/components/shared/EmptyState";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { BTN_MODAL_PANEL } from "@/lib/button-styles";
import { createExpandedCanvas, type ExpandDirection } from "@/lib/canvas-expand";
import toast from "react-hot-toast";

export interface GenerativeFillModalProps {
  open: boolean;
  onClose: () => void;
  canvasImageUrl: string | null;
  createEditGuard: () => () => boolean;
  beginOperation: () => () => void;
  onApplied: (resultUrl: string, isCurrent: () => boolean) => boolean | Promise<boolean>;
}

export default function GenerativeFillModal({
  open,
  onClose,
  canvasImageUrl,
  onApplied,
  createEditGuard,
  beginOperation,
}: GenerativeFillModalProps) {
  const [direction, setDirection] = useState<ExpandDirection>("right");
  const [expandPixels, setExpandPixels] = useState("128");
  const [prompt, setPrompt] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDirection("right");
    setExpandPixels("128");
    setPrompt("");
    setPreviewUrl(null);
  }, [open]);

  useEffect(() => {
    if (!open || !canvasImageUrl) {
      setPreviewUrl(null);
      return;
    }
    const px = Math.round(parseInt(expandPixels, 10));
    if (!Number.isFinite(px) || px < 1) {
      setPreviewUrl(null);
      return;
    }

    let cancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (cancelled) return;
      try {
        const c = document.createElement("canvas");
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        const ctx = c.getContext("2d");
        if (!ctx) {
          setPreviewUrl(null);
          return;
        }
        ctx.drawImage(img, 0, 0);
        const expanded = createExpandedCanvas(c, direction, px);
        setPreviewUrl(expanded.toDataURL("image/png"));
      } catch {
        setPreviewUrl(null);
      }
    };
    img.onerror = () => {
      if (!cancelled) setPreviewUrl(null);
    };
    img.src = canvasImageUrl;

    return () => {
      cancelled = true;
    };
  }, [open, canvasImageUrl, direction, expandPixels]);

  async function handleApply() {
    if (!canvasImageUrl) return;
    const px = Math.round(parseInt(expandPixels, 10));
    if (!Number.isFinite(px) || px < 1 || px > 512) {
      toast.error("Enter expand pixels between 1 and 512");
      return;
    }
    const promptTrim = prompt.trim();
    if (!promptTrim) {
      toast.error("Enter a prompt");
      return;
    }

    const isCurrent = createEditGuard();
    const finishOperation = beginOperation();
    setLoading(true);
    try {
      const res = await fetch("/api/ai/generative-fill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl: canvasImageUrl,
          expandDirection: direction,
          expandPixels: px,
          prompt: promptTrim,
        }),
      });

      if (res.status === 402) {
        toast("Insufficient credits", { icon: "💳" });
        return;
      }
      if (res.status === 429) {
        toast("Rate limit exceeded. Please try again later.", { icon: "⏱" });
        return;
      }
      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(errBody.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { resultUrl?: string };
      if (!isCurrent()) return;
      if (data.resultUrl) {
        if (!(await onApplied(data.resultUrl, isCurrent))) return;
      }
      toast.success("Generative Fill applied successfully");
      onClose();
    } catch (err) {
      console.error("[GenerativeFillModal] generative_fill failed:", err);
      toast.error("Generative Fill failed");
    } finally {
      finishOperation();
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="genfill-modal-title"
    >
      <div className="relative w-full max-w-[480px] bg-[#121212] border border-[#212121] rounded-xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-4 h-11 border-b border-[#212121] shrink-0">
          <h2 id="genfill-modal-title" className="text-[13px] font-medium text-white">
            Generative Fill
          </h2>
          <button
            type="button"
            disabled={loading}
            onClick={onClose}
            className="text-[#555555] hover:text-[#888888] transition-colors p-1 disabled:opacity-40"
            aria-label="Close"
          >
            <Icon name="XClose" size={16} aria-hidden />
          </button>
        </div>

        <div className="p-4 flex flex-col gap-3 overflow-y-auto min-h-0">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-[#555555]">
              Expand direction
            </label>
            <select
              value={direction}
              onChange={(e) => setDirection(e.target.value as ExpandDirection)}
              disabled={loading}
              className="h-[34px] bg-[#1d1d1d] border border-[#262626] rounded-lg px-2 text-[13px] text-white outline-none focus:border-[#3A6FFF]/60 cursor-pointer disabled:opacity-40"
            >
              <option value="top">Top</option>
              <option value="bottom">Bottom</option>
              <option value="left">Left</option>
              <option value="right">Right</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-[#555555]">
              Expand pixels (1–512)
            </label>
            <input
              type="number"
              min={1}
              max={512}
              value={expandPixels}
              onChange={(e) => setExpandPixels(e.target.value)}
              disabled={loading}
              className="h-[34px] bg-[#1d1d1d] border border-[#262626] rounded-lg px-2 text-[13px] text-white outline-none focus:border-[#3A6FFF]/60 disabled:opacity-40"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-[#555555]">
              Prompt
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={loading}
              rows={3}
              placeholder="Describe what should appear in the new area…"
              className="w-full bg-[#1d1d1d] border border-[#262626] rounded-lg px-2 py-2 text-[13px] text-white outline-none focus:border-[#3A6FFF]/60 resize-none disabled:opacity-40 placeholder:text-[#555555]"
            />
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-[#555555]">
              Preview (transparent = new area)
            </span>
            <div
              className="rounded-lg border border-[#262626] overflow-hidden flex items-center justify-center min-h-[120px] max-h-[200px] bg-[#1d1d1d] [background-image:linear-gradient(45deg,rgba(255,255,255,0.03)_25%,transparent_25%),linear-gradient(-45deg,rgba(255,255,255,0.03)_25%,transparent_25%),linear-gradient(45deg,transparent_75%,rgba(255,255,255,0.03)_75%),linear-gradient(-45deg,transparent_75%,rgba(255,255,255,0.03)_75%)] [background-size:10px_10px] [background-position:0_0,0_5px,5px_-5px,-5px_0]"
            >
              {previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewUrl}
                  alt="Expanded canvas preview"
                  className="max-w-full max-h-[200px] w-auto h-auto object-contain"
                />
              ) : canvasImageUrl ? (
                <LoadingSpinner size="xs" label="Loading preview" />
              ) : (
                <EmptyState icon="Image01" message="No image" variant="compact" />
              )}
            </div>
          </div>
        </div>

        <div className="flex gap-2 p-5 pt-0 shrink-0">
          <button
            type="button"
            disabled={loading}
            onClick={onClose}
            className="flex-1 h-[34px] bg-[#1d1d1d] border border-[#262626] rounded-md text-[13px] text-white hover:border-[#2e2e2e] transition-colors cursor-pointer disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={loading || !canvasImageUrl}
            onClick={() => void handleApply()}
            className={BTN_MODAL_PANEL}
          >
            {loading ? (
              <LoadingSpinner size="sm" label="Applying generative fill" />
            ) : (
              "Apply"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
