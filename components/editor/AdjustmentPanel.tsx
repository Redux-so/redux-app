"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Star, Lock, Unlock, X } from "lucide-react";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import toast from "react-hot-toast";
import AdjustmentSlider, { type SliderTrackVariant } from "./AdjustmentSlider";
import type { AdjustmentKey, Adjustments } from "@/constants/adjustments";
import { DEFAULT_ADJUSTMENTS, normalizeAdjustments } from "@/constants/adjustments";
import { createExpandedCanvas, type ExpandDirection } from "@/hooks/useCanvas";
import { BTN_PRIMARY_BLOCK, BTN_PRIMARY_PANEL, BTN_PRIMARY_SOLID } from "@/lib/button-styles";

interface AdjustmentPanelProps {
  adjustments: Adjustments;
  onPreview: (key: AdjustmentKey, value: number) => void;
  onCommit: (key: AdjustmentKey, value: number) => void;
  /** Batch-apply AI adjustment patches with a single undo checkpoint. */
  onPatch?: (patch: Partial<Record<string, number>>) => void;
  imageId?: string;
  imageUrl?: string | null;
  imageWidth?: number;
  imageHeight?: number;
  // Canvas transform callbacks
  onCrop?: () => void;
  onRotateCW?: () => void;
  onStraighten?: (degrees: number) => void;
  onResize?: (width: number, height: number) => void | Promise<void>;
  /** Called with the new URL after an AI operation replaces the canvas image. */
  onReloadCanvas?: (url: string) => void | Promise<void>;
  /** Active canvas image URL (may differ from library original after AI edits). */
  canvasImageUrl?: string | null;
  enableHealBrush?: () => void | Promise<void>;
  disableHealBrush?: () => void;
  exportHealMask?: () => Promise<string>;
  enableEraserBrush?: () => void | Promise<void>;
  disableEraserBrush?: () => void;
  exportEraserMask?: () => Promise<string>;
  enableBlurBrush?: () => void | Promise<void>;
  disableBlurBrush?: () => void;
  exportBlurMask?: () => Promise<string>;
}

interface SectionState {
  light: boolean;
  color: boolean;
  effects: boolean;
  retouch: boolean;
  transform: boolean;
}

type ActiveTool = "heal" | "blur" | "eraser" | "crop" | "straighten" | null;

function applyAiAdjustments(
  patch: Partial<Record<string, number>>,
  onPatch: (p: Partial<Record<string, number>>) => void,
) {
  onPatch(patch);
}

const LIGHT_ADJUSTMENTS: { key: AdjustmentKey; label: string }[] = [
  { key: "exposure", label: "Exposure" },
  { key: "contrast", label: "Contrast" },
  { key: "blacks", label: "Blacks" },
  { key: "whites", label: "Whites" },
  { key: "highlights", label: "Highlights" },
  { key: "shadows", label: "Shadows" },
];

const COLOR_TRACK_VARIANTS: Partial<Record<AdjustmentKey, SliderTrackVariant>> = {
  temperature: "temperature",
  tint: "tint",
  hue: "hue",
};

const COLOR_ADJUSTMENTS: { key: AdjustmentKey; label: string }[] = [
  { key: "vibrance", label: "Vibrance" },
  { key: "saturation", label: "Saturation" },
  { key: "temperature", label: "Temperature" },
  { key: "tint", label: "Tint" },
  { key: "hue", label: "Hue" },
];

const EFFECTS_ADJUSTMENTS: { key: AdjustmentKey; label: string }[] = [
  { key: "sharpen", label: "Sharpen" },
  { key: "noiseReduction", label: "Noise Reduction" },
  { key: "vignette", label: "Vignette" },
  { key: "grain", label: "Grain" },
  { key: "clarity", label: "Clarity" },
];

// ── Shared sub-components ────────────────────────────────────────────────────

function SectionHeader({
  label,
  open,
  onToggle,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="flex items-center justify-between w-full px-6 py-3 hover:bg-white/[0.04] transition-colors"
    >
      <span className="text-[13px] font-medium uppercase tracking-widest text-[#666666] select-none">
        {label}
      </span>
      <ChevronDown
        size={12}
        strokeWidth={2}
        className={`text-[#555555] transition-transform duration-150 ${open ? "" : "-rotate-90"}`}
      />
    </button>
  );
}

// Full-width AI button (star icon + label)
function AIButton({
  label,
  loading,
  disabled,
  onClick,
}: {
  label: string;
  loading: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading || disabled}
      className="flex items-center justify-center gap-[7px] w-full h-9 bg-[#682FBF]/[0.1] border border-[#682FBF]/30 rounded-lg text-[13px] text-[#C4A0F5] hover:bg-[#682FBF]/[0.18] hover:border-[#682FBF]/50 hover:shadow-glow-sm transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
    >
      {loading ? (
        <LoadingSpinner size="sm" variant="brand" label={`${label} loading`} />
      ) : (
        <Star size={14} strokeWidth={1.5} className="text-[#9B6EE8]" />
      )}
      {label}
    </button>
  );
}

// Half-width tool button (toggleable active state)
function ToolBtn({
  label,
  active,
  disabled,
  onClick,
}: {
  label: ReactNode;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        disabled
          ? "flex w-full items-center justify-center h-9 px-3 text-[13px] font-medium capitalize rounded-xl border border-white/[0.05] bg-white/[0.03] text-white/20 opacity-40 cursor-not-allowed"
          : active
            ? `${BTN_PRIMARY_SOLID} w-full capitalize`
            : "flex w-full items-center justify-center h-9 px-3 text-[13px] font-medium capitalize rounded-xl border border-white/[0.08] bg-white/[0.05] text-white/80 hover:bg-white/[0.09] hover:border-white/[0.15] transition-colors cursor-pointer"
      }
    >
      {label}
    </button>
  );
}

async function fileToBase64(
  file: File,
): Promise<{ dataUrl: string; base64: string; mediaType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const [header, b64] = dataUrl.split(",");
      const mediaType = header.replace("data:", "").replace(";base64", "");
      resolve({ dataUrl, base64: b64, mediaType });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ── Main component ───────────────────────────────────────────────────────────

export default function AdjustmentPanel({
  adjustments,
  onPreview,
  onCommit,
  onPatch,
  imageId,
  imageUrl,
  imageWidth,
  imageHeight,
  onCrop,
  onRotateCW,
  onStraighten,
  onResize,
  onReloadCanvas,
  canvasImageUrl,
  enableHealBrush,
  disableHealBrush,
  exportHealMask,
  enableEraserBrush,
  disableEraserBrush,
  exportEraserMask,
  enableBlurBrush,
  disableBlurBrush,
  exportBlurMask,
}: AdjustmentPanelProps) {
  const [sections, setSections] = useState<SectionState>({
    light: true,
    color: true,
    effects: true,
    retouch: true,
    transform: true,
  });
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [activeTool, setActiveTool] = useState<ActiveTool>(null);

  // Straighten inline slider
  const [showStraighten, setShowStraighten] = useState(false);
  const [straightenDeg, setStraightenDeg] = useState(0);

  // Resize inline form
  const [showResize, setShowResize] = useState(false);
  const [resizeW, setResizeW] = useState(String(imageWidth ?? ""));
  const [resizeH, setResizeH] = useState(String(imageHeight ?? ""));
  const [resizeLocked, setResizeLocked] = useState(true);
  const aspectRatio = imageWidth && imageHeight ? imageWidth / imageHeight : 1;

  function handleResizeW(val: string) {
    const w = parseInt(val);
    if (resizeLocked && !isNaN(w)) {
      setResizeW(val);
      setResizeH(String(Math.round(w / aspectRatio)));
    } else {
      setResizeW(val);
    }
  }

  function handleResizeH(val: string) {
    const h = parseInt(val);
    if (resizeLocked && !isNaN(h)) {
      setResizeH(val);
      setResizeW(String(Math.round(h * aspectRatio)));
    } else {
      setResizeH(val);
    }
  }

  function applyResize() {
    const w = parseInt(resizeW);
    const h = parseInt(resizeH);
    if (!isNaN(w) && !isNaN(h) && w > 0 && h > 0) {
      void onResize?.(w, h);
      setShowResize(false);
    }
  }

  // Loading flags per AI button
  const [loadingEnhance, setLoadingEnhance] = useState(false);
  const [loadingToneBalance, setLoadingToneBalance] = useState(false);
  const [loadingSmartColor, setLoadingSmartColor] = useState(false);
  const [loadingStyleMatch, setLoadingStyleMatch] = useState(false);
  const [styleMatchPreview, setStyleMatchPreview] = useState<string | null>(null);
  const styleMatchInputRef = useRef<HTMLInputElement>(null);
  const [loadingGenFill, setLoadingGenFill] = useState(false);
  const [genFillModalOpen, setGenFillModalOpen] = useState(false);
  const [genFillDirection, setGenFillDirection] = useState<ExpandDirection>("right");
  const [genFillPixels, setGenFillPixels] = useState("128");
  const [genFillPrompt, setGenFillPrompt] = useState("");
  const [genFillPreviewUrl, setGenFillPreviewUrl] = useState<string | null>(null);
  const [loadingRemoveBg, setLoadingRemoveBg] = useState(false);
  const [loadingHeal, setLoadingHeal] = useState(false);
  const [loadingEraser, setLoadingEraser] = useState(false);
  const [loadingBlur, setLoadingBlur] = useState(false);
  const [blurIntensity, setBlurIntensity] = useState(30);

  const prevActiveToolRef = useRef<ActiveTool>(null);
  useEffect(() => {
    const prev = prevActiveToolRef.current;
    if (activeTool === "heal" && prev !== "heal") {
      void enableHealBrush?.();
    }
    if (activeTool !== "heal" && prev === "heal") {
      disableHealBrush?.();
    }
    if (activeTool === "eraser" && prev !== "eraser") {
      void enableEraserBrush?.();
    }
    if (activeTool !== "eraser" && prev === "eraser") {
      disableEraserBrush?.();
    }
    if (activeTool === "blur" && prev !== "blur") {
      void enableBlurBrush?.();
    }
    if (activeTool !== "blur" && prev === "blur") {
      disableBlurBrush?.();
    }
    prevActiveToolRef.current = activeTool;
  }, [activeTool, enableHealBrush, disableHealBrush, enableEraserBrush, disableEraserBrush, enableBlurBrush, disableBlurBrush]);

  function toggleSection(key: keyof SectionState) {
    setSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function toggleTool(tool: ActiveTool) {
    setActiveTool((prev) => (prev === tool ? null : tool));
  }

  // ── Shared AI error handler ───────────────────────────────────────────────
  /** Returns true if the error was handled (caller should return early). */
  function handleAiError(status: number): boolean {
    if (status === 402) {
      toast("Insufficient credits — purchase more to continue.", { icon: "💳" });
      return true;
    }
    if (status === 429) {
      toast("Rate limit exceeded. Please try again later.", { icon: "⏱" });
      return true;
    }
    return false;
  }

  // ── Auto Enhance ──────────────────────────────────────────────────────────
  async function runAutoEnhance() {
    if (!imageUrl) return;
    setLoadingEnhance(true);
    try {
      const res = await fetch("/api/ai/enhance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl, currentAdjustments: adjustments }),
      });
      if (handleAiError(res.status)) return;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { adjustments?: Partial<Record<AdjustmentKey, number>> };
      if (data.adjustments) {
        applyAiAdjustments(data.adjustments, onPatch ?? (() => {}));
      }
      toast.success("Auto Enhance applied");
    } catch (err) {
      console.error("[AdjustmentPanel] auto_enhance failed:", err);
      toast.error("Auto Enhance failed");
    } finally {
      setLoadingEnhance(false);
    }
  }

  // ── Auto Tone Balance ─────────────────────────────────────────────────────
  async function runAutoToneBalance() {
    if (!imageUrl) return;
    setLoadingToneBalance(true);
    try {
      const res = await fetch("/api/ai/tone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl, currentAdjustments: adjustments }),
      });
      if (handleAiError(res.status)) return;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { adjustments?: Partial<Record<AdjustmentKey, number>> };
      if (data.adjustments) {
        applyAiAdjustments(data.adjustments, onPatch ?? (() => {}));
      }
      toast.success("Auto Tone Balance applied");
    } catch (err) {
      console.error("[AdjustmentPanel] auto_tone_balance failed:", err);
      toast.error("Auto Tone Balance failed");
    } finally {
      setLoadingToneBalance(false);
    }
  }

  // ── Smart Color Balance ───────────────────────────────────────────────────
  async function runSmartColorBalance() {
    if (!imageUrl) return;
    setLoadingSmartColor(true);
    try {
      const res = await fetch("/api/ai/color-balance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl, currentAdjustments: adjustments }),
      });
      if (handleAiError(res.status)) return;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { adjustments?: Partial<Record<AdjustmentKey, number>> };
      if (data.adjustments) {
        applyAiAdjustments(data.adjustments, onPatch ?? (() => {}));
      }
      toast.success("Smart Color Balance applied");
    } catch (err) {
      console.error("[AdjustmentPanel] smart_color_balance failed:", err);
      toast.error("Smart Color Balance failed");
    } finally {
      setLoadingSmartColor(false);
    }
  }

  // ── Style Match (reference image + vision) ───────────────────────────────
  async function handleStyleMatchFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    e.target.value = "";
    if (!file || !imageUrl) return;

    try {
      const { dataUrl, base64, mediaType } = await fileToBase64(file);
      setStyleMatchPreview(dataUrl);
      setLoadingStyleMatch(true);

      const res = await fetch("/api/ai/style-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl,
          referenceImageBase64: base64,
          referenceImageMediaType: mediaType,
        }),
      });

      if (res.status === 402) {
        toast("Insufficient credits", { icon: "💳" });
        setStyleMatchPreview(null);
        return;
      }
      if (res.status === 429) {
        toast("Rate limit exceeded. Please try again later.", { icon: "⏱" });
        setStyleMatchPreview(null);
        return;
      }
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = (await res.json()) as { adjustments?: Partial<Record<AdjustmentKey, number>> };
      if (data.adjustments) {
        applyAiAdjustments(data.adjustments, onPatch ?? (() => {}));
      }
      toast.success("Style Match applied");
      setStyleMatchPreview(null);
    } catch (err) {
      console.error("[AdjustmentPanel] style_match failed:", err);
      toast.error("Style Match failed");
      setStyleMatchPreview(null);
    } finally {
      setLoadingStyleMatch(false);
    }
  }

  // ── Remove Background ─────────────────────────────────────────────────────
  async function runRemoveBackground() {
    if (!imageUrl || !imageId) return;
    setLoadingRemoveBg(true);
    try {
      const res = await fetch("/api/ai/background-remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl, imageId }),
      });
      if (handleAiError(res.status)) return;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { resultUrl?: string };
      if (data.resultUrl) {
        await onReloadCanvas?.(data.resultUrl);
      }
      toast.success("Background removed successfully");
    } catch (err) {
      console.error("[AdjustmentPanel] remove_background failed:", err);
      toast.error("Background removal failed");
    } finally {
      setLoadingRemoveBg(false);
    }
  }

  // ── Heal (inpainting) ─────────────────────────────────────────────────────
  async function confirmHeal() {
    if (!canvasImageUrl || !imageId || !exportHealMask) return;
    setLoadingHeal(true);
    try {
      let maskBase64: string;
      try {
        maskBase64 = await exportHealMask();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Could not export mask";
        toast.error(msg);
        return;
      }
      const res = await fetch("/api/ai/heal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl: canvasImageUrl,
          maskBase64,
          imageId,
        }),
      });
      if (res.status === 402) {
        toast("Insufficient credits", { icon: "💳" });
        return;
      }
      if (res.status === 429) {
        toast("Rate limit exceeded", { icon: "⏱" });
        return;
      }
      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as { detail?: string };
        throw new Error(errBody.detail ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { resultUrl?: string };
      if (data.resultUrl) {
        await onReloadCanvas?.(data.resultUrl);
      }
      toast.success("Heal applied successfully");
      disableHealBrush?.();
      setActiveTool(null);
    } catch (err) {
      console.error("[AdjustmentPanel] heal failed:", err);
      toast.error("Heal failed");
    } finally {
      setLoadingHeal(false);
    }
  }

  function cancelHeal() {
    setActiveTool(null);
  }

  // ── Eraser (inpainting via heal API) ──────────────────────────────────────
  async function confirmEraser() {
    if (!canvasImageUrl || !imageId || !exportEraserMask) return;
    setLoadingEraser(true);
    try {
      let maskBase64: string;
      try {
        maskBase64 = await exportEraserMask();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Could not export mask";
        toast.error(msg);
        return;
      }
      const res = await fetch("/api/images/erase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: canvasImageUrl, maskBase64, imageId }),
      });
      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as { detail?: string };
        throw new Error(errBody.detail ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { resultUrl?: string };
      if (data.resultUrl) {
        await onReloadCanvas?.(data.resultUrl);
      }
      toast.success("Eraser applied successfully");
      disableEraserBrush?.();
      setActiveTool(null);
    } catch (err) {
      console.error("[AdjustmentPanel] eraser failed:", err);
      toast.error("Eraser failed");
    } finally {
      setLoadingEraser(false);
    }
  }

  function cancelEraser() {
    setActiveTool(null);
  }

  // ── Blur (Sharp Gaussian blur via painted mask) ───────────────────────────
  async function confirmBlur() {
    if (!canvasImageUrl || !imageId || !exportBlurMask) return;
    setLoadingBlur(true);
    try {
      let maskBase64: string;
      try {
        maskBase64 = await exportBlurMask();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Could not export mask";
        toast.error(msg);
        return;
      }
      const res = await fetch("/api/images/blur", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: canvasImageUrl, maskBase64, imageId, blurIntensity }),
      });
      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as { detail?: string };
        throw new Error(errBody.detail ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { resultUrl?: string };
      if (data.resultUrl) {
        await onReloadCanvas?.(data.resultUrl);
      }
      toast.success("Blur applied successfully");
      disableBlurBrush?.();
      setActiveTool(null);
    } catch (err) {
      console.error("[AdjustmentPanel] blur failed:", err);
      toast.error("Blur failed");
    } finally {
      setLoadingBlur(false);
    }
  }

  function cancelBlur() {
    setActiveTool(null);
  }

  useEffect(() => {
    if (!genFillModalOpen || !canvasImageUrl) {
      setGenFillPreviewUrl(null);
      return;
    }
    const px = Math.round(parseInt(genFillPixels, 10));
    if (!Number.isFinite(px) || px < 1) {
      setGenFillPreviewUrl(null);
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
          setGenFillPreviewUrl(null);
          return;
        }
        ctx.drawImage(img, 0, 0);
        const expanded = createExpandedCanvas(c, genFillDirection, px);
        setGenFillPreviewUrl(expanded.toDataURL("image/png"));
      } catch {
        setGenFillPreviewUrl(null);
      }
    };
    img.onerror = () => {
      if (!cancelled) setGenFillPreviewUrl(null);
    };
    img.src = canvasImageUrl;

    return () => {
      cancelled = true;
    };
  }, [genFillModalOpen, canvasImageUrl, genFillDirection, genFillPixels]);

  function openGenerativeFillModal() {
    setGenFillDirection("right");
    setGenFillPixels("128");
    setGenFillPrompt("");
    setGenFillPreviewUrl(null);
    setGenFillModalOpen(true);
  }

  async function applyGenerativeFill() {
    if (!canvasImageUrl) return;
    const px = Math.round(parseInt(genFillPixels, 10));
    if (!Number.isFinite(px) || px < 1 || px > 512) {
      toast.error("Enter expand pixels between 1 and 512");
      return;
    }
    const promptTrim = genFillPrompt.trim();
    if (!promptTrim) {
      toast.error("Enter a prompt");
      return;
    }

    setLoadingGenFill(true);
    try {
      const res = await fetch("/api/ai/generative-fill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl: canvasImageUrl,
          expandDirection: genFillDirection,
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
        const errBody = (await res.json().catch(() => ({}))) as { detail?: string };
        throw new Error(errBody.detail ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { resultUrl?: string };
      if (data.resultUrl) {
        await onReloadCanvas?.(data.resultUrl);
      }
      toast.success("Generative Fill applied successfully");
      setGenFillModalOpen(false);
    } catch (err) {
      console.error("[AdjustmentPanel] generative_fill failed:", err);
      toast.error("Generative Fill failed");
    } finally {
      setLoadingGenFill(false);
    }
  }

  return (
    <div
      className={[
        "flex flex-col shrink-0 h-full min-w-0 bg-black/50 backdrop-blur-xl border-r border-white/[0.07] overflow-hidden transition-[width] duration-200 ease-out",
        panelCollapsed ? "w-[44px]" : "w-[400px]",
      ].join(" ")}
    >
      {/* Panel header */}
      <div
        className={[
          "flex items-center shrink-0 h-[52px] border-b border-white/[0.07]",
          panelCollapsed ? "justify-center px-0" : "justify-between px-6",
        ].join(" ")}
      >
        {!panelCollapsed && (
          <span className="text-[14px] font-medium uppercase tracking-widest text-[#888888] select-none">
            Adjustments
          </span>
        )}
        <button
          type="button"
          aria-expanded={!panelCollapsed}
          aria-label={
            panelCollapsed ? "Expand adjustments panel" : "Collapse adjustments panel"
          }
          onClick={() => setPanelCollapsed((prev) => !prev)}
          className="text-[#555555] hover:text-[#888888] transition-colors cursor-pointer"
        >
          {panelCollapsed ? (
            <ChevronRight size={14} strokeWidth={2} />
          ) : (
            <ChevronLeft size={14} strokeWidth={2} />
          )}
        </button>
      </div>

      {/* Scrollable content */}
      {!panelCollapsed && (
      <div className="flex-1 overflow-y-auto min-h-0">

        {/* ── LIGHT ──────────────────────────────────────────────────────── */}
        <SectionHeader
          label="Light"
          open={sections.light}
          onToggle={() => toggleSection("light")}
        />
        {sections.light && (
          <div className="pb-2">
            {LIGHT_ADJUSTMENTS.map(({ key, label }) => (
              <AdjustmentSlider
                key={key}
                label={label}
                value={adjustments[key]}
                onChange={(v) => onPreview(key, v)}
                onCommit={(v) => onCommit(key, v)}
              />
            ))}
            <div className="flex flex-col gap-2 px-6 pt-3 pb-1">
              <AIButton
                label="Auto Enhance"
                loading={loadingEnhance}
                disabled={!imageUrl}
                onClick={() => void runAutoEnhance()}
              />
              <AIButton
                label="Auto Tone Balance"
                loading={loadingToneBalance}
                disabled={!imageUrl}
                onClick={() => void runAutoToneBalance()}
              />
            </div>
          </div>
        )}

        {/* ── COLOR ──────────────────────────────────────────────────────── */}
        <SectionHeader
          label="Color"
          open={sections.color}
          onToggle={() => toggleSection("color")}
        />
        {sections.color && (
          <div className="pb-2">
            {COLOR_ADJUSTMENTS.map(({ key, label }) => (
              <AdjustmentSlider
                key={key}
                label={label}
                value={adjustments[key]}
                onChange={(v) => onPreview(key, v)}
                onCommit={(v) => onCommit(key, v)}
                trackVariant={COLOR_TRACK_VARIANTS[key] ?? "neutral"}
              />
            ))}
            <div className="flex flex-col gap-2 px-6 pt-3 pb-1">
              <AIButton
                label="Smart Color Balance"
                loading={loadingSmartColor}
                disabled={!imageUrl}
                onClick={() => void runSmartColorBalance()}
              />
              <input
                ref={styleMatchInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { void handleStyleMatchFilePick(e); }}
              />
              {styleMatchPreview && (
                <div className="px-0 pb-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={styleMatchPreview}
                    alt="Style reference"
                    className="h-[48px] w-auto max-w-full rounded-sm object-cover border border-[#2a2a2a]"
                  />
                  <p className="text-[10px] text-[#555555] mt-1">Reference style</p>
                </div>
              )}
              <AIButton
                label="Style Match"
                loading={loadingStyleMatch}
                disabled={!imageUrl}
                onClick={() => styleMatchInputRef.current?.click()}
              />
            </div>
          </div>
        )}

        {/* ── EFFECTS ────────────────────────────────────────────────────── */}
        <SectionHeader
          label="Effects"
          open={sections.effects}
          onToggle={() => toggleSection("effects")}
        />
        {sections.effects && (
          <div className="pb-2">
            {EFFECTS_ADJUSTMENTS.map(({ key, label }) => (
              <AdjustmentSlider
                key={key}
                label={label}
                value={adjustments[key]}
                onChange={(v) => onPreview(key, v)}
                onCommit={(v) => onCommit(key, v)}
              />
            ))}
          </div>
        )}

        {/* ── RETOUCH ────────────────────────────────────────────────────── */}
        <SectionHeader
          label="Retouch"
          open={sections.retouch}
          onToggle={() => toggleSection("retouch")}
        />
        {sections.retouch && (
          <div className="px-6 pt-2 pb-3 flex flex-col gap-2">
            {/* Row 1: Heal | Blur */}
            <div className="grid grid-cols-2 gap-2">
              <AIButton
                label="Heal"
                loading={loadingHeal}
                disabled={!canvasImageUrl || loadingHeal}
                onClick={() => toggleTool("heal")}
              />
              <ToolBtn
                label={
                  loadingBlur ? (
                    <LoadingSpinner size="sm" variant="brand" label="Blur loading" />
                  ) : (
                    "Blur"
                  )
                }
                active={activeTool === "blur"}
                disabled={loadingBlur}
                onClick={() => toggleTool("blur")}
              />
            </div>
            {activeTool === "blur" && (
              <div className="flex flex-col gap-2 pt-1">
                <p className="text-[10px] text-[#555555] leading-snug">
                  Paint over the area to blur in yellow, then confirm.
                </p>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-[#888888] shrink-0">Intensity</span>
                  <input
                    type="range"
                    min={1}
                    max={100}
                    step={1}
                    value={blurIntensity}
                    onChange={(e) => setBlurIntensity(Number(e.target.value))}
                    className="flex-1 accent-[#8B44E8] h-[3px] cursor-pointer"
                  />
                  <span className="text-[11px] text-[#888888] w-[24px] text-right shrink-0">{blurIntensity}</span>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={cancelBlur}
                    className="flex-1 h-[34px] bg-white/[0.05] border border-white/[0.08] rounded-lg text-[13px] text-white hover:bg-white/[0.09] transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void confirmBlur()}
                    disabled={loadingBlur}
                    className={BTN_PRIMARY_PANEL}
                  >
                    {loadingBlur ? (
                      <LoadingSpinner size="sm" variant="brand" label="Processing blur" />
                    ) : (
                      "Confirm"
                    )}
                  </button>
                </div>
              </div>
            )}
            {activeTool === "heal" && (
              <div className="flex flex-col gap-2">
                <p className="text-[10px] text-[#555555] leading-snug">
                  Paint over the area to heal in red, then confirm.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={cancelHeal}
                    disabled={loadingHeal}
                    className="flex-1 h-[34px] bg-white/[0.05] border border-white/[0.08] rounded-lg text-[13px] text-white hover:bg-white/[0.09] transition-colors cursor-pointer disabled:opacity-40"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void confirmHeal()}
                    disabled={loadingHeal}
                    className={BTN_PRIMARY_PANEL}
                  >
                    {loadingHeal ? (
                      <LoadingSpinner size="sm" variant="brand" label="Processing heal" />
                    ) : (
                      "Confirm"
                    )}
                  </button>
                </div>
              </div>
            )}
            {/* Row 2: Eraser (first column only) */}
            <div className="grid grid-cols-2 gap-2">
              <ToolBtn
                label="Eraser"
                active={activeTool === "eraser"}
                onClick={() => toggleTool("eraser")}
              />
            </div>
            {activeTool === "eraser" && (
              <div className="flex flex-col gap-2 pt-1">
                <p className="text-[12px] text-[#888888] leading-relaxed">
                  Paint over the area to erase in white, then confirm.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={cancelEraser}
                    className="flex-1 h-[34px] bg-white/[0.05] border border-white/[0.08] rounded-lg text-[13px] text-white hover:bg-white/[0.09] transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void confirmEraser()}
                    disabled={loadingEraser}
                    className={BTN_PRIMARY_PANEL}
                  >
                    {loadingEraser ? (
                      <LoadingSpinner size="sm" variant="brand" label="Processing eraser" />
                    ) : (
                      "Confirm"
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── TRANSFORM ──────────────────────────────────────────────────── */}
        <SectionHeader
          label="Transform"
          open={sections.transform}
          onToggle={() => toggleSection("transform")}
        />
        {sections.transform && (
          <div className="px-6 pt-2 pb-4 flex flex-col gap-2">
            {/* Row 1: Crop | Rotate */}
            <div className="grid grid-cols-2 gap-2">
              <ToolBtn
                label="Crop"
                active={activeTool === "crop"}
                onClick={() => {
                  toggleTool("crop");
                  onCrop?.();
                }}
              />
              <ToolBtn
                label="Rotate"
                active={false}
                onClick={() => onRotateCW?.()}
              />
            </div>
            {/* Row 2: Straighten | Resize */}
            <div className="grid grid-cols-2 gap-2">
              <ToolBtn
                label="Straighten"
                active={showStraighten}
                onClick={() => setShowStraighten((v) => !v)}
              />
              <ToolBtn
                label="Resize"
                active={showResize}
                onClick={() => setShowResize((v) => !v)}
              />
            </div>

            {/* Inline straighten slider */}
            {showStraighten && (
              <AdjustmentSlider
                label="Angle"
                value={straightenDeg}
                min={-45}
                max={45}
                step={0.5}
                onChange={(v) => {
                  setStraightenDeg(v);
                  onStraighten?.(v);
                }}
                onCommit={(v) => {
                  setStraightenDeg(v);
                  onStraighten?.(v);
                }}
              />
            )}

            {/* Inline resize form */}
            {showResize && (
              <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-3 flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <div className="flex flex-col gap-1 flex-1">
                    <label className="text-[10px] text-[#555555] uppercase tracking-wider">
                      Width
                    </label>
                    <input
                      type="number"
                      value={resizeW}
                      onChange={(e) => handleResizeW(e.target.value)}
                      className="w-full h-[30px] bg-white/[0.05] border border-white/[0.08] rounded-lg px-2 text-[12px] text-white outline-none focus:border-[#682FBF]/60"
                    />
                  </div>
                  <button
                    onClick={() => setResizeLocked((v) => !v)}
                    className="mt-4 text-[#555555] hover:text-[#888888] transition-colors shrink-0"
                    title={resizeLocked ? "Unlock aspect ratio" : "Lock aspect ratio"}
                  >
                    {resizeLocked ? (
                      <Lock size={13} strokeWidth={1.75} />
                    ) : (
                      <Unlock size={13} strokeWidth={1.75} />
                    )}
                  </button>
                  <div className="flex flex-col gap-1 flex-1">
                    <label className="text-[10px] text-[#555555] uppercase tracking-wider">
                      Height
                    </label>
                    <input
                      type="number"
                      value={resizeH}
                      onChange={(e) => handleResizeH(e.target.value)}
                      className="w-full h-[30px] bg-white/[0.05] border border-white/[0.08] rounded-lg px-2 text-[12px] text-white outline-none focus:border-[#682FBF]/60"
                    />
                  </div>
                </div>
                <button
                  onClick={applyResize}
                  className={BTN_PRIMARY_BLOCK}
                >
                  Apply
                </button>
              </div>
            )}

            <p className="text-[10px] text-[#555555] uppercase tracking-widest pt-1 pb-0.5">
              Edit / Expand
            </p>
            {/* AI transform buttons */}
            <AIButton
              label="Generative Fill"
              loading={loadingGenFill}
              disabled={!canvasImageUrl}
              onClick={openGenerativeFillModal}
            />
            <AIButton
              label="Remove Background"
              loading={loadingRemoveBg}
              disabled={!imageUrl || !imageId}
              onClick={() => void runRemoveBackground()}
            />
          </div>
        )}

      </div>
      )}

      {genFillModalOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="genfill-modal-title"
        >
          <div className="relative w-full max-w-[480px] bg-[#111111] border border-white/[0.1] rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-4 h-11 border-b border-white/[0.07] shrink-0">
              <h2 id="genfill-modal-title" className="text-[13px] font-medium text-white">
                Generative Fill
              </h2>
              <button
                type="button"
                disabled={loadingGenFill}
                onClick={() => setGenFillModalOpen(false)}
                className="text-[#555555] hover:text-[#888888] transition-colors p-1 disabled:opacity-40"
                aria-label="Close"
              >
                <X size={16} strokeWidth={2} />
              </button>
            </div>

            <div className="p-4 flex flex-col gap-3 overflow-y-auto min-h-0">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-[#555555] uppercase tracking-wider">
                  Expand direction
                </label>
                <select
                  value={genFillDirection}
                  onChange={(e) => setGenFillDirection(e.target.value as ExpandDirection)}
                  disabled={loadingGenFill}
                  className="h-[34px] bg-white/[0.05] border border-white/[0.08] rounded-lg px-2 text-[13px] text-white outline-none focus:border-[#682FBF]/60 cursor-pointer disabled:opacity-40"
                >
                  <option value="top">Top</option>
                  <option value="bottom">Bottom</option>
                  <option value="left">Left</option>
                  <option value="right">Right</option>
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-[#555555] uppercase tracking-wider">
                  Expand pixels (1–512)
                </label>
                <input
                  type="number"
                  min={1}
                  max={512}
                  value={genFillPixels}
                  onChange={(e) => setGenFillPixels(e.target.value)}
                  disabled={loadingGenFill}
                  className="h-[34px] bg-white/[0.05] border border-white/[0.08] rounded-lg px-2 text-[13px] text-white outline-none focus:border-[#682FBF]/60 disabled:opacity-40"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-[#555555] uppercase tracking-wider">
                  Prompt
                </label>
                <textarea
                  value={genFillPrompt}
                  onChange={(e) => setGenFillPrompt(e.target.value)}
                  disabled={loadingGenFill}
                  rows={3}
                  placeholder="Describe what should appear in the new area…"
                  className="w-full bg-white/[0.05] border border-white/[0.08] rounded-lg px-2 py-2 text-[13px] text-white outline-none focus:border-[#682FBF]/60 resize-none disabled:opacity-40 placeholder:text-[#555555]"
                />
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-[#555555] uppercase tracking-wider">
                  Preview (transparent = new area)
                </span>
                <div
                  className="rounded-lg border border-white/[0.08] overflow-hidden flex items-center justify-center min-h-[120px] max-h-[200px] bg-white/[0.03] [background-image:linear-gradient(45deg,rgba(255,255,255,0.03)_25%,transparent_25%),linear-gradient(-45deg,rgba(255,255,255,0.03)_25%,transparent_25%),linear-gradient(45deg,transparent_75%,rgba(255,255,255,0.03)_75%),linear-gradient(-45deg,transparent_75%,rgba(255,255,255,0.03)_75%)] [background-size:10px_10px] [background-position:0_0,0_5px,5px_-5px,-5px_0]"
                >
                  {genFillPreviewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={genFillPreviewUrl}
                      alt="Expanded canvas preview"
                      className="max-w-full max-h-[200px] w-auto h-auto object-contain"
                    />
                  ) : canvasImageUrl ? (
                    <LoadingSpinner size="xs" label="Loading preview" />
                  ) : (
                    <span className="text-[11px] text-[#555555] px-4 py-6 text-center">
                      No image
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex gap-2 p-5 pt-0 shrink-0">
              <button
                type="button"
                disabled={loadingGenFill}
                onClick={() => setGenFillModalOpen(false)}
                className="flex-1 h-[34px] bg-white/[0.05] border border-white/[0.08] rounded-lg text-[13px] text-white hover:bg-white/[0.09] transition-colors cursor-pointer disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={loadingGenFill || !canvasImageUrl}
                onClick={() => void applyGenerativeFill()}
                className={BTN_PRIMARY_PANEL}
              >
                {loadingGenFill ? (
                  <LoadingSpinner size="sm" variant="brand" label="Applying generative fill" />
                ) : (
                  "Apply"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
