"use client";

import dynamic from "next/dynamic";
import { useEffect, useImperativeHandle, useRef, useState, type ReactNode, type Ref } from "react";
import { EDITOR_TOOL_ROUTES } from "@/lib/editor-tool-routes";
import { Icon, type IconName } from "@/components/shared/Icon";
import DiscordIcon from "@/components/shared/DiscordIcon";
import GitHubIcon from "@/components/shared/GitHubIcon";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import toast from "react-hot-toast";
import type { HistoryPanelProps } from "./HistoryPanel";
import AdjustmentSlider, { type SliderTrackVariant } from "./AdjustmentSlider";
import type { AdjustmentKey, Adjustments } from "@/constants/adjustments";
import { BTN_PRIMARY_BLOCK, BTN_PRIMARY_SOLID } from "@/lib/button-styles";
import type { BrushSizes, RetouchTool } from "@/lib/retouch-brush";
import RetouchBrushControls, { RetouchSlider } from "./RetouchBrushControls";
import { PANEL_HEADER, PANEL_TITLE } from "@/lib/panel-chrome";
import ProfileMenu from "@/components/shared/ProfileMenu";
import {
  EXTERNAL_LINK_PROPS,
  REDUX_DOCS_URL,
  REDUX_HELP_FEEDBACK_URL,
} from "@/constants/support";
import { SURFACE_BTN_ACTIVE, SURFACE_BTN_IDLE, SURFACE_SECONDARY_BTN } from "@/lib/surface-colors";

interface AdjustmentPanelProps {
  mobileLayout?: boolean;
  mobileVisible?: boolean;
  mobileChatActive?: boolean;
  onMobilePanelChange?: (open: boolean) => void;
  onMobileChatToggle?: () => void;
  chatControlsRef?: Ref<AdjustmentPanelChatControls>;
  adjustments: Adjustments;
  onPreview: (key: AdjustmentKey, value: number) => void;
  onCommit: (key: AdjustmentKey, value: number) => void;
  /** Batch-apply AI adjustment patches with a single undo checkpoint. */
  onPatch?: (patch: Partial<Record<string, number>>, label?: string) => void;
  imageId?: string;
  imageUrl?: string | null;
  imageWidth?: number;
  imageHeight?: number;
  /** Current canvas pixel dimensions — preferred over original DB dims after crop/resize. */
  canvasWidth?: number;
  canvasHeight?: number;
  // Canvas transform callbacks
  isCropping?: boolean;
  onToggleCrop?: () => void;
  onRotateCW?: () => void;
  onStraighten?: (degrees: number) => void;
  onStraightenCommit?: (degrees: number) => void;
  /** Restored straighten angle — keeps the slider in sync after reload. */
  straightenDegrees?: number;
  onResize?: (width: number, height: number) => void | Promise<void>;
  /** Called with the new URL after an AI operation replaces the canvas image. */
  restoredMaskTool: ActiveTool;
  createEditGuard: () => () => boolean;
  beginOperation: () => () => void;
  onReloadCanvas?: (url: string, isCurrent?: () => boolean, label?: string) => boolean | Promise<boolean>;
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
  brushSizes: BrushSizes;
  setBrushSize: (tool: RetouchTool, size: number) => void;
  history: HistoryPanelProps;
}

export interface AdjustmentPanelChatControls {
  openBrush: (tool: RetouchTool, size?: number, intensity?: number) => void;
  closeBrush: () => void;
  getBlurIntensity?: () => number;
}

type ToolSection = "light" | "color" | "effects" | "retouch" | "transform" | "history";

type ActiveTool = "heal" | "blur" | "eraser" | "straighten" | null;

const TOOL_SECTIONS: {
  id: ToolSection;
  label: string;
  title: string;
  iconName: IconName;
}[] = [
  { id: "light", label: "Light", title: "Light adjustments", iconName: "Sun" },
  { id: "color", label: "Color", title: "Color adjustments", iconName: "Colors" },
  { id: "effects", label: "Effects", title: "Effects adjustments", iconName: "Star04" },
  { id: "retouch", label: "Retouch", title: "Retouch tools", iconName: "Brush01" },
  { id: "transform", label: "Transform", title: "Crop and geometry", iconName: "Crop01" },
];

const RAIL_ICON_STROKE = 1.25;
const RAIL_ICON_SIZE = 24;
/** Filled brand marks read larger than stroke icons at the same pixel size. */
const RAIL_BRAND_ICON_SIZE = 22;
/** Sun's radiating lines read lighter at the default rail stroke — nudge slightly. */
const RAIL_ICON_STROKE_OVERRIDES: Partial<Record<IconName, number>> = {
  Sun: 1.7,
};

function RailIcon({ iconName }: { iconName: IconName }) {
  return (
    <Icon
      name={iconName}
      size={RAIL_ICON_SIZE}
      strokeWidth={RAIL_ICON_STROKE_OVERRIDES[iconName] ?? RAIL_ICON_STROKE}
      aria-hidden
    />
  );
}

function RailDiscordIcon() {
  return <DiscordIcon size={RAIL_BRAND_ICON_SIZE} />;
}

function RailGitHubIcon() {
  return <GitHubIcon size={RAIL_BRAND_ICON_SIZE} />;
}

function applyAiAdjustments(
  patch: Partial<Record<string, number>>,
  onPatch: (p: Partial<Record<string, number>>, label?: string) => void,
  label: string,
) {
  onPatch(patch, label);
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

const HistoryVersionList = dynamic(
  () => import("./HistoryPanel").then((m) => ({ default: m.HistoryVersionList })),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-1 items-center justify-center py-8">
        <LoadingSpinner size="sm" label="Loading history" />
      </div>
    ),
  },
);

const GenerativeFillModal = dynamic(() => import("./GenerativeFillModal"), {
  ssr: false,
});

const EFFECTS_ADJUSTMENTS: { key: AdjustmentKey; label: string }[] = [
  { key: "sharpen", label: "Sharpen" },
  { key: "noiseReduction", label: "Noise Reduction" },
  { key: "vignette", label: "Vignette" },
  { key: "grain", label: "Grain" },
  { key: "clarity", label: "Clarity" },
];

// ── Shared sub-components ────────────────────────────────────────────────────

function RailBtn({
  active,
  title,
  onClick,
  children,
}: {
  active: boolean;
  title: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={active}
      data-motion-control
      className={[
        "flex shrink-0 items-center justify-center h-12 w-12 rounded-xl border transition-colors cursor-pointer",
        active
          ? `${SURFACE_BTN_ACTIVE} !text-white`
          : `${SURFACE_BTN_IDLE}`,
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function RailLink({
  href,
  title,
  external,
  children,
}: {
  href: string;
  title: string;
  external?: boolean;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      title={title}
      aria-label={title}
      {...(external ? EXTERNAL_LINK_PROPS : {})}
      className="flex shrink-0 items-center justify-center h-12 w-12 rounded-xl border border-[#121212] text-[#888888] transition-colors hover:bg-[#1d1d1d] hover:text-white"
    >
      {children}
    </a>
  );
}

// Credit-backed AI action — matches idle ToolBtn (Eraser, Heal, etc.)
function AIButton({
  label,
  loading,
  active,
  disabled,
  onClick,
}: {
  label: string;
  loading: boolean;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading || disabled}
      aria-pressed={active}
      className={
        loading || disabled
          ? "flex w-full items-center justify-center gap-1.5 h-9 px-3 text-[13px] font-medium rounded-md border border-[#262626] bg-[#1d1d1d] text-white/20 opacity-40 cursor-not-allowed"
          : active
            ? `${BTN_PRIMARY_SOLID} w-full gap-1.5`
          : `flex w-full items-center justify-center gap-1.5 h-9 px-3 text-[13px] font-medium rounded-md text-white/80 ${SURFACE_SECONDARY_BTN}`
      }
    >
      {loading ? (
        <LoadingSpinner size="sm" label={`${label} loading`} />
      ) : (
        <Icon name="Star01" size={16} className="shrink-0" aria-hidden />
      )}
      {!loading && label}
    </button>
  );
}

// Full-width tool button (toggleable active state)
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
          ? "flex w-full items-center justify-center h-9 px-3 text-[13px] font-medium capitalize rounded-md border border-[#262626] bg-[#1d1d1d] text-white/20 opacity-40 cursor-not-allowed"
          : active
            ? `${BTN_PRIMARY_SOLID} w-full capitalize`
            : `flex w-full items-center justify-center h-9 px-3 text-[13px] font-medium capitalize rounded-md text-white/80 ${SURFACE_SECONDARY_BTN}`
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
  mobileLayout = false,
  mobileVisible = false,
  mobileChatActive = false,
  onMobilePanelChange,
  onMobileChatToggle,
  chatControlsRef,
  adjustments,
  onPreview,
  onCommit,
  onPatch,
  imageId,
  imageUrl,
  imageWidth,
  imageHeight,
  canvasWidth,
  canvasHeight,
  onToggleCrop,
  isCropping = false,
  onRotateCW,
  onStraighten,
  onStraightenCommit,
  straightenDegrees = 0,
  onResize,
  onReloadCanvas,
  createEditGuard,
  beginOperation,
  restoredMaskTool,
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
  brushSizes,
  setBrushSize,
  history,
}: AdjustmentPanelProps) {
  const [activeSection, setActiveSection] = useState<ToolSection | null>(null);
  const panelInnerRef = useRef<HTMLDivElement>(null);
  const [activeTool, setActiveTool] = useState<ActiveTool>(null);
  useEffect(() => {
    setActiveTool(restoredMaskTool);
  }, [restoredMaskTool]);

  // Straighten inline slider
  const [showStraighten, setShowStraighten] = useState(false);
  const [straightenDeg, setStraightenDeg] = useState(straightenDegrees);

  useEffect(() => {
    setStraightenDeg(straightenDegrees);
  }, [straightenDegrees]);

  const effectiveWidth = canvasWidth ?? imageWidth;
  const effectiveHeight = canvasHeight ?? imageHeight;

  // Resize inline form
  const [showResize, setShowResize] = useState(false);
  const [resizeW, setResizeW] = useState(String(effectiveWidth ?? ""));
  const [resizeH, setResizeH] = useState(String(effectiveHeight ?? ""));
  const [resizeLocked, setResizeLocked] = useState(true);
  const aspectRatio =
    effectiveWidth && effectiveHeight ? effectiveWidth / effectiveHeight : 1;

  useEffect(() => {
    if (!effectiveWidth || !effectiveHeight) return;
    setResizeW(String(effectiveWidth));
    setResizeH(String(effectiveHeight));
  }, [effectiveWidth, effectiveHeight]);

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
  const [loadingColorBalance, setLoadingColorBalance] = useState(false);
  const [loadingStyleMatch, setLoadingStyleMatch] = useState(false);
  const [styleMatchPreview, setStyleMatchPreview] = useState<string | null>(null);
  const styleMatchInputRef = useRef<HTMLInputElement>(null);
  const [genFillModalOpen, setGenFillModalOpen] = useState(false);
  const [loadingRemoveBg, setLoadingRemoveBg] = useState(false);
  const [loadingHeal, setLoadingHeal] = useState(false);
  const [loadingEraser, setLoadingEraser] = useState(false);
  const [loadingBlur, setLoadingBlur] = useState(false);
  const [blurIntensity, setBlurIntensity] = useState(30);
  useImperativeHandle(chatControlsRef, () => ({
    openBrush(tool, size, intensity) {
      if (isCropping) onToggleCrop?.();
      setActiveSection("retouch");
      onMobilePanelChange?.(true);
      if (size !== undefined) setBrushSize(tool, size);
      if (intensity !== undefined) setBlurIntensity(intensity);
      setActiveTool(tool);
    },
    closeBrush() { setActiveTool(null); },
    getBlurIntensity: () => blurIntensity,
  }));

  const prevActiveToolRef = useRef<ActiveTool>(null);
  useEffect(() => {
    const prev = prevActiveToolRef.current;
    if (activeTool !== "heal" && prev === "heal") disableHealBrush?.();
    if (activeTool !== "eraser" && prev === "eraser") disableEraserBrush?.();
    if (activeTool !== "blur" && prev === "blur") disableBlurBrush?.();
    if (activeTool === "heal" && prev !== "heal") void enableHealBrush?.();
    if (activeTool === "eraser" && prev !== "eraser") void enableEraserBrush?.();
    if (activeTool === "blur" && prev !== "blur") void enableBlurBrush?.();
    prevActiveToolRef.current = activeTool;
  }, [activeTool, enableHealBrush, disableHealBrush, enableEraserBrush, disableEraserBrush, enableBlurBrush, disableBlurBrush]);

  // Entering crop mode disables retouch brushes.
  useEffect(() => {
    if (isCropping && activeTool !== null) {
      setActiveTool(null);
    }
  }, [isCropping, activeTool]);

  function toggleActiveSection(section: ToolSection) {
    const next = activeSection === section && (!mobileLayout || mobileVisible) ? null : section;
    setActiveSection(next);
    onMobilePanelChange?.(next !== null);
  }

  useEffect(() => {
    if (!activeSection) return;
    const scrollEl = panelInnerRef.current?.querySelector<HTMLElement>("[data-panel-scroll]");
    if (scrollEl) scrollEl.scrollTop = 0;
  }, [activeSection]);

  function toggleTool(tool: ActiveTool) {
    setActiveTool((prev) => (prev === tool ? null : tool));
  }

  const aiImageUrl = canvasImageUrl ?? imageUrl;

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
    if (!aiImageUrl) return;
    setLoadingEnhance(true);
    const isCurrent = createEditGuard();
    const finishOperation = beginOperation();
    try {
      const res = await fetch(EDITOR_TOOL_ROUTES.auto_enhance, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: aiImageUrl, currentAdjustments: adjustments }),
      });
      if (handleAiError(res.status)) return;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { adjustments?: Partial<Record<AdjustmentKey, number>> };
      if (!isCurrent()) return;
      if (data.adjustments) {
        applyAiAdjustments(data.adjustments, onPatch ?? (() => {}), "Auto enhance applied");
      }
      toast.success("Auto Enhance applied");
    } catch (err) {
      console.error("[AdjustmentPanel] auto_enhance failed:", err);
      toast.error("Auto Enhance failed");
    } finally {
      finishOperation();
      setLoadingEnhance(false);
    }
  }

  // ── Auto Tone Balance ─────────────────────────────────────────────────────
  async function runAutoToneBalance() {
    if (!aiImageUrl) return;
    setLoadingToneBalance(true);
    const isCurrent = createEditGuard();
    const finishOperation = beginOperation();
    try {
      const res = await fetch(EDITOR_TOOL_ROUTES.auto_tone_balance, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: aiImageUrl, currentAdjustments: adjustments }),
      });
      if (handleAiError(res.status)) return;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { adjustments?: Partial<Record<AdjustmentKey, number>> };
      if (!isCurrent()) return;
      if (data.adjustments) {
        applyAiAdjustments(data.adjustments, onPatch ?? (() => {}), "Tone balance applied");
      }
      toast.success("Auto Tone Balance applied");
    } catch (err) {
      console.error("[AdjustmentPanel] auto_tone_balance failed:", err);
      toast.error("Auto Tone Balance failed");
    } finally {
      finishOperation();
      setLoadingToneBalance(false);
    }
  }

  // ── Color Balance ───────────────────────────────────────────────────
  async function runColorBalance() {
    if (!aiImageUrl) return;
    setLoadingColorBalance(true);
    const isCurrent = createEditGuard();
    const finishOperation = beginOperation();
    try {
      const res = await fetch(EDITOR_TOOL_ROUTES.smart_color_balance, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: aiImageUrl, currentAdjustments: adjustments }),
      });
      if (handleAiError(res.status)) return;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { adjustments?: Partial<Record<AdjustmentKey, number>> };
      if (!isCurrent()) return;
      if (data.adjustments) {
        applyAiAdjustments(data.adjustments, onPatch ?? (() => {}), "Color balance applied");
      }
      toast.success("Color Balance applied");
    } catch (err) {
      console.error("[AdjustmentPanel] color_balance failed:", err);
      toast.error("Color Balance failed");
    } finally {
      finishOperation();
      setLoadingColorBalance(false);
    }
  }

  // ── Style Match (reference image + vision) ───────────────────────────────
  async function handleStyleMatchFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    e.target.value = "";
    if (!file || !aiImageUrl) return;

    const isCurrent = createEditGuard();
    const finishOperation = beginOperation();
    try {
      const { dataUrl, base64, mediaType } = await fileToBase64(file);
      setStyleMatchPreview(dataUrl);
      setLoadingStyleMatch(true);

      const res = await fetch(EDITOR_TOOL_ROUTES.style_match, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl: aiImageUrl,
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
      if (!isCurrent()) return;
      if (data.adjustments) {
        applyAiAdjustments(data.adjustments, onPatch ?? (() => {}), "Style match applied");
      }
      toast.success("Style Match applied");
      setStyleMatchPreview(null);
    } catch (err) {
      console.error("[AdjustmentPanel] style_match failed:", err);
      toast.error("Style Match failed");
      setStyleMatchPreview(null);
    } finally {
      finishOperation();
      setLoadingStyleMatch(false);
    }
  }

  // ── Remove Background ─────────────────────────────────────────────────────
  async function runRemoveBackground() {
    if (!aiImageUrl || !imageId) return;
    setLoadingRemoveBg(true);
    const isCurrent = createEditGuard();
    const finishOperation = beginOperation();
    try {
      const res = await fetch(EDITOR_TOOL_ROUTES.remove_background, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: aiImageUrl, imageId }),
      });
      if (handleAiError(res.status)) return;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { resultUrl?: string };
      if (!isCurrent()) return;
      if (data.resultUrl) {
        if (!(await onReloadCanvas?.(data.resultUrl, isCurrent, "Background removed"))) return;
      }
      toast.success("Background removed successfully");
    } catch (err) {
      console.error("[AdjustmentPanel] remove_background failed:", err);
      toast.error("Background removal failed");
    } finally {
      finishOperation();
      setLoadingRemoveBg(false);
    }
  }

  // ── Heal (inpainting) ─────────────────────────────────────────────────────
  async function confirmHeal() {
    if (!canvasImageUrl || !imageId || !exportHealMask) return;
    setLoadingHeal(true);
    const isCurrent = createEditGuard();
    const finishOperation = beginOperation();
    try {
      let maskBase64: string;
      try {
        maskBase64 = await exportHealMask();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Could not export mask";
        toast.error(msg);
        return;
      }
      const res = await fetch(EDITOR_TOOL_ROUTES.heal, {
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
        const errBody = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(errBody.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { resultUrl?: string };
      if (!isCurrent()) return;
      if (data.resultUrl) {
        if (!(await onReloadCanvas?.(data.resultUrl, isCurrent, "Heal applied"))) return;
      }
      toast.success("Heal applied successfully");
      disableHealBrush?.();
      setActiveTool(null);
    } catch (err) {
      console.error("[AdjustmentPanel] heal failed:", err);
      toast.error("Heal failed");
    } finally {
      finishOperation();
      setLoadingHeal(false);
    }
  }

  function cancelHeal() {
    createEditGuard();
    setActiveTool(null);
  }

  // ── Eraser (inpainting via heal API) ──────────────────────────────────────
  async function confirmEraser() {
    if (!canvasImageUrl || !imageId || !exportEraserMask) return;
    setLoadingEraser(true);
    const isCurrent = createEditGuard();
    const finishOperation = beginOperation();
    try {
      let maskBase64: string;
      try {
        maskBase64 = await exportEraserMask();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Could not export mask";
        toast.error(msg);
        return;
      }
      const res = await fetch(EDITOR_TOOL_ROUTES.eraser, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: canvasImageUrl, maskBase64, imageId }),
      });
      if (res.status === 402) {
        toast("Insufficient credits — purchase more to continue.", { icon: "💳" });
        return;
      }
      if (res.status === 429 || res.status === 503) {
        const errBody = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(errBody.error ?? "Too many requests. Please slow down.");
        return;
      }
      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(errBody.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { resultUrl?: string };
      if (!isCurrent()) return;
      if (data.resultUrl) {
        if (!(await onReloadCanvas?.(data.resultUrl, isCurrent, "Eraser applied"))) return;
      }
      toast.success("Eraser applied successfully");
      disableEraserBrush?.();
      setActiveTool(null);
    } catch (err) {
      console.error("[AdjustmentPanel] eraser failed:", err);
      toast.error("Eraser failed");
    } finally {
      finishOperation();
      setLoadingEraser(false);
    }
  }

  function cancelEraser() {
    createEditGuard();
    setActiveTool(null);
  }

  // ── Blur (Sharp Gaussian blur via painted mask) ───────────────────────────
  async function confirmBlur() {
    if (!canvasImageUrl || !imageId || !exportBlurMask) return;
    setLoadingBlur(true);
    const isCurrent = createEditGuard();
    const finishOperation = beginOperation();
    try {
      let maskBase64: string;
      try {
        maskBase64 = await exportBlurMask();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Could not export mask";
        toast.error(msg);
        return;
      }
      const res = await fetch(EDITOR_TOOL_ROUTES.blur, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: canvasImageUrl, maskBase64, imageId, blurIntensity }),
      });
      if (res.status === 429 || res.status === 503) {
        const errBody = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(errBody.error ?? "Too many requests. Please slow down.");
        return;
      }
      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(errBody.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { resultUrl?: string };
      if (!isCurrent()) return;
      if (data.resultUrl) {
        if (!(await onReloadCanvas?.(data.resultUrl, isCurrent, "Blur applied"))) return;
      }
      toast.success("Blur applied successfully");
      disableBlurBrush?.();
      setActiveTool(null);
    } catch (err) {
      console.error("[AdjustmentPanel] blur failed:", err);
      toast.error("Blur failed");
    } finally {
      finishOperation();
      setLoadingBlur(false);
    }
  }

  function cancelBlur() {
    createEditGuard();
    setActiveTool(null);
  }

  const activeSectionMeta = TOOL_SECTIONS.find((s) => s.id === activeSection);
  const activeSectionLabel =
    activeSection === "history"
      ? "History"
      : activeSectionMeta?.label ?? "";

  return (
    <>
      <div className="editor-adjustments flex shrink-0 h-full min-w-0">
        {/* Icon tool rail */}
        <div className="editor-tool-rail flex flex-col shrink-0 w-[72px] h-full items-center bg-[#121212] border-r border-[#212121]">
          <div className="editor-tool-buttons flex flex-col items-center py-4 gap-4">
            <div className="lg:hidden">
              <RailBtn active={mobileChatActive} title="Chat" onClick={() => onMobileChatToggle?.()}>
                <RailIcon iconName="MessageSquare01" />
              </RailBtn>
            </div>
            {TOOL_SECTIONS.map(({ id, title, iconName }) => (
              <RailBtn
                key={id}
                active={activeSection === id && (!mobileLayout || mobileVisible)}
                title={title}
                onClick={() => toggleActiveSection(id)}
              >
                <RailIcon iconName={iconName} />
              </RailBtn>
            ))}
            <RailBtn
              active={activeSection === "history" && (!mobileLayout || mobileVisible)}
              title="Version history"
              onClick={() => toggleActiveSection("history")}
            >
              <RailIcon iconName="ClockRewind" />
            </RailBtn>
          </div>

          <div className="editor-rail-footer mt-auto shrink-0 pb-4 w-full flex flex-col items-center gap-4">
            <div className="editor-rail-links flex flex-col items-center gap-4">
              <RailLink href={REDUX_DOCS_URL} title="GitHub" external>
                <RailGitHubIcon />
              </RailLink>
              <RailLink href={REDUX_HELP_FEEDBACK_URL} title="Help & Feedback" external>
                <RailDiscordIcon />
              </RailLink>
            </div>
            <ProfileMenu
              variant="compact"
              settingsReturnPath={
                imageId
                  ? `/editor?imageId=${encodeURIComponent(imageId)}`
                  : "/editor"
              }
            />
          </div>
        </div>

        {/* Section panel */}
        <div
          className={[
            "editor-section-panel flex flex-col shrink-0 h-full min-w-0 bg-[#121212] overflow-hidden transition-[width] duration-200 ease-out",
            activeSection
              ? "w-[360px] rounded-r-2xl border-r border-[#212121]"
              : "w-0 border-r-0",
          ].join(" ")}
        >
          {activeSection && (
            <div
              key={activeSection}
              ref={panelInnerRef}
              className="redux-content-enter editor-section-content flex flex-col h-full w-[360px] min-w-[360px]"
            >
              <div className={`${PANEL_HEADER} px-8`}>
                <span className={PANEL_TITLE}>{activeSectionLabel}</span>
                <button type="button" aria-label="Close adjustments" onClick={() => onMobilePanelChange?.(false)} className="ml-auto -mr-2 lg:hidden text-[#888888] p-2 cursor-pointer">
                  <Icon name="ChevronDown" size={20} />
                </button>
              </div>

              {activeSection === "history" ? (
                <HistoryVersionList
                  {...history}
                />
              ) : (
                <div className="flex-1 overflow-y-auto min-h-0" data-panel-scroll>
                  {activeSection === "light" && (
                    <div className="pb-4 pt-4">
                      {LIGHT_ADJUSTMENTS.map(({ key, label }) => (
                        <AdjustmentSlider
                          key={key}
                          label={label}
                          value={adjustments[key]}
                          onChange={(v) => onPreview(key, v)}
                          onCommit={(v) => onCommit(key, v)}
                        />
                      ))}
                      <div className="flex flex-col gap-3 px-8 pt-5 pb-3">
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

                  {activeSection === "color" && (
                    <div className="pb-4 pt-4">
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
                      <div className="flex flex-col gap-3 px-8 pt-5 pb-3">
                        <AIButton
                          label="Color Balance"
                          loading={loadingColorBalance}
                          disabled={!imageUrl}
                          onClick={() => void runColorBalance()}
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
                              className="h-[48px] w-auto max-w-full rounded-sm object-cover border border-[#212121]"
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

                  {activeSection === "effects" && (
                    <div className="pb-4 pt-4">
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

                  {activeSection === "retouch" && (
                    <div className="px-8 pt-4 pb-5 flex flex-col gap-3">
                      <ToolBtn
                        label={
                          loadingBlur ? (
                            <LoadingSpinner size="sm" label="Blur loading" />
                          ) : (
                            "Blur"
                          )
                        }
                        active={activeTool === "blur"}
                        disabled={loadingBlur}
                        onClick={() => {
                          if (isCropping) onToggleCrop?.();
                          toggleTool("blur");
                        }}
                      />
                      {activeTool === "blur" && (
                        <RetouchBrushControls tool="blur"
                          instruction="Paint over the area to blur in yellow, then confirm."
                          size={brushSizes.blur} onSizeChange={(size) => setBrushSize("blur", size)}
                          loading={loadingBlur} onCancel={cancelBlur} onConfirm={confirmBlur}>
                          <RetouchSlider label="Intensity" value={blurIntensity} max={100} resetValue={30} disabled={loadingBlur} onChange={setBlurIntensity} />
                        </RetouchBrushControls>
                      )}
                      <ToolBtn
                        label="Eraser"
                        disabled={loadingEraser}
                        active={activeTool === "eraser"}
                        onClick={() => {
                          if (isCropping) onToggleCrop?.();
                          toggleTool("eraser");
                        }}
                      />
                      {activeTool === "eraser" && (
                        <RetouchBrushControls tool="eraser"
                          instruction="Paint over the area to erase in white, then confirm."
                          size={brushSizes.eraser} onSizeChange={(size) => setBrushSize("eraser", size)}
                          loading={loadingEraser} onCancel={cancelEraser} onConfirm={confirmEraser} />
                      )}
                      <AIButton
                        label="Heal"
                        active={activeTool === "heal"}
                        loading={loadingHeal}
                        disabled={!canvasImageUrl || loadingHeal}
                        onClick={() => {
                          if (isCropping) onToggleCrop?.();
                          toggleTool("heal");
                        }}
                      />
                      {activeTool === "heal" && (
                        <RetouchBrushControls tool="heal"
                          instruction="Paint over the area to heal in red, then confirm."
                          size={brushSizes.heal} onSizeChange={(size) => setBrushSize("heal", size)}
                          loading={loadingHeal} onCancel={cancelHeal} onConfirm={confirmHeal} />
                      )}
                    </div>
                  )}

                  {activeSection === "transform" && (
                    <div className="px-8 pt-4 pb-5 flex flex-col gap-3">
                      <ToolBtn
                        label="Crop"
                        active={isCropping}
                        onClick={() => onToggleCrop?.()}
                      />
                      <ToolBtn
                        label="Rotate"
                        active={false}
                        onClick={() => onRotateCW?.()}
                      />
                      <ToolBtn
                        label="Straighten"
                        active={showStraighten}
                        onClick={() => {
                          if (!showStraighten && isCropping) onToggleCrop?.();
                          setShowStraighten((v) => !v);
                        }}
                      />
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
                            onStraightenCommit?.(v);
                          }}
                        />
                      )}
                      <ToolBtn
                        label="Resize"
                        active={showResize}
                        onClick={() => {
                          if (!showResize && isCropping) onToggleCrop?.();
                          setShowResize((v) => !v);
                        }}
                      />
                      {showResize && (
                        <div className="bg-[#1d1d1d] border border-[#262626] rounded-xl p-3 flex flex-col gap-3">
                          <div className="flex items-center gap-2">
                            <div className="flex flex-col gap-1 flex-1">
                              <label htmlFor="editor-resize-width" className="text-[11px] font-medium text-[#555555]">
                                Width
                              </label>
                              <input
                                id="editor-resize-width"
                                type="number"
                                value={resizeW}
                                onChange={(e) => handleResizeW(e.target.value)}
                                className="w-full h-[30px] bg-[#1d1d1d] border border-[#262626] rounded-lg px-2 text-[12px] text-white outline-none focus:border-[#3A6FFF]/60"
                              />
                            </div>
                            <button
                              onClick={() => setResizeLocked((v) => !v)}
                              className="mt-4 text-[#555555] hover:text-[#888888] transition-colors shrink-0"
                              title={resizeLocked ? "Unlock aspect ratio" : "Lock aspect ratio"}
                            >
                              {resizeLocked ? (
                                <Icon name="Lock01" size={16} aria-hidden />
                              ) : (
                                <Icon name="LockUnlocked01" size={16} aria-hidden />
                              )}
                            </button>
                            <div className="flex flex-col gap-1 flex-1">
                              <label htmlFor="editor-resize-height" className="text-[11px] font-medium text-[#555555]">
                                Height
                              </label>
                              <input
                                id="editor-resize-height"
                                type="number"
                                value={resizeH}
                                onChange={(e) => handleResizeH(e.target.value)}
                                className="w-full h-[30px] bg-[#1d1d1d] border border-[#262626] rounded-lg px-2 text-[12px] text-white outline-none focus:border-[#3A6FFF]/60"
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
                      <AIButton
                        label="Generative Fill"
                        loading={false}
                        disabled={!canvasImageUrl}
                        onClick={() => setGenFillModalOpen(true)}
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
            </div>
          )}
        </div>
      </div>

      {genFillModalOpen && (
        <GenerativeFillModal
          open={genFillModalOpen}
          onClose={() => setGenFillModalOpen(false)}
          canvasImageUrl={canvasImageUrl ?? null}
          createEditGuard={createEditGuard}
          beginOperation={beginOperation}
          onApplied={async (url, isCurrent) => (await onReloadCanvas?.(url, isCurrent, "Generative fill applied")) ?? false}
        />
      )}
    </>
  );
}
