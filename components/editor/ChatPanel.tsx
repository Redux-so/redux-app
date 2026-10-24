"use client";

import { positionChatPopover } from "@/lib/chat-popover-position";
import { createUuid } from "@/lib/create-uuid";
import dynamic from "next/dynamic";
import { useImageChatHistory } from "@/hooks/useImageChatHistory";
import { cleanChatText as cleanText, type ChatMessage as Message } from "@/lib/chat-history-shared";
import { CHAT_PROGRESS_LABELS, initialChatProgress } from "@/lib/chat-progress";
import { actionCost, actionLabel, editorPlanSchema, type ChatToolPlan, type EditorToolContext } from "@/lib/editor-actions";
import type { ActionExecution } from "@/lib/editor-action-runner";
import type { EditorChange, EditorChangeReview } from "@/lib/editor-change-review";
import { chatToolsRequest } from "@/hooks/useEditorChatTools";
import { useUser } from "@clerk/nextjs";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal, flushSync } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Image from "next/image";
import BrandLogo from "@/components/shared/BrandLogo";
import { Icon } from "@/components/shared/Icon";
import ChatEmptyState from "@/components/editor/ChatEmptyState";
import { ShimmerText } from "@/components/shared/ShimmerText";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import toast from "react-hot-toast";
import type { Adjustments } from "@/hooks/useEditor";
import type { AdjustmentKey } from "@/constants/adjustments";
import { CHAT_AVAILABLE_MODELS } from "@/constants/ai-models";
import {
  ASK_SWITCH_TO_AGENT_NUDGE,
  CHAT_INTERACTION_MODES,
  DEFAULT_CHAT_INTERACTION_MODE,
  getChatInteractionMode,
  type ChatInteractionModeId,
} from "@/constants/chat-interaction-mode";
import { normalizeAdjustmentPatch } from "@/constants/adjustments";
import {
  CHAT_ASSISTANT_LOADING_LABEL,
  CHAT_ATTACHMENT_FILENAME_MAX_WIDTH_PX,
  CHAT_INPUT_ATTACHMENT_MAX_WIDTH_PX,
  CHAT_MESSAGE_ATTACHMENT_MAX_WIDTH_PX,
  CHAT_PANEL_COLLAPSED_WIDTH_PX,
  CHAT_PANEL_WIDTH_PX,
  CHAT_STATUS_TEXT_CLASS,
  CHAT_STATUS_TEXT_COLOR_CLASS,
} from "@/constants/chat-panel";
import { BTN_BRAND_ICON, BTN_PRIMARY_COMPACT } from "@/lib/button-styles";
import { BRAND_BORDER_CLASS } from "@/lib/brand-colors";
import { PANEL_HEADER, PANEL_TITLE, CHAT_POPOVER_CHROME } from "@/lib/panel-chrome";
import { TOAST_SHELL_CLASS, toastAnimation } from "@/lib/toast-styles";
import { ChatMarkdown } from "@/lib/chat-markdown";
import UsageRing from "@/components/shared/UsageRing";
import {
  isChatQuotaBlocked,
  quotaFromApi,
  type UsageQuotaSnapshot,
} from "@/lib/usage-ring-state";
import {
  CHAT_VISION_MAX_PX,
  isChatImageMediaType,
} from "@/lib/chat-image-shared";
import {
  allowChatAdjustmentsForTurn,
  askModeNudgeMissing,
  type ChatHistoryMessage,
} from "@/lib/chat-edit-intent";


const CreditShopModal = dynamic(() => import("@/components/shared/CreditShopModal"), {
  ssr: false,
});

const BTN_SECONDARY =
  "inline-flex items-center justify-center h-8 px-3.5 rounded-md border border-[#262626] bg-[#1d1d1d] text-[12px] font-semibold text-white/90 hover:border-[#2e2e2e] transition-colors cursor-pointer select-none disabled:opacity-40 disabled:cursor-not-allowed";

const AVAILABLE_MODELS = CHAT_AVAILABLE_MODELS;

const COMING_SOON_MODEL_ROW = {
  id: "coming-soon",
  badge: "More coming soon",
} as const;

/** Fits “More coming soon” badge; menu is at least as wide as the trigger chip. */
const MODEL_MENU_MIN_WIDTH_PX = 140;
const MODEL_MENU_ESTIMATED_HEIGHT = 80;
const MODEL_MENU_ROW_CLASS =
  "flex w-full min-w-0 items-center justify-between gap-2 px-1.5 py-1.5 text-left leading-none";

function modelMenuWidthPx(triggerWidth: number) {
  return Math.max(triggerWidth, MODEL_MENU_MIN_WIDTH_PX);
}

const INTERACTION_MENU_MIN_WIDTH_PX = 112;
const INTERACTION_MENU_ESTIMATED_HEIGHT = 64;

function interactionMenuWidthPx(triggerWidth: number) {
  return Math.max(triggerWidth, INTERACTION_MENU_MIN_WIDTH_PX);
}

/** Reference-matched surfaces — Redux dark palette, Adam proportions/weight. */
const CHAT_SURFACE_SHADOW =
  "shadow-[0_1px_3px_rgba(0,0,0,0.32),0_2px_8px_rgba(0,0,0,0.14)]";
const TOOLBAR_CHIP_H = "h-8";
const TOOLBAR_CHIP =
  "rounded-md border border-[#262626] bg-[#1d1d1d] shadow-[0_1px_2px_rgba(0,0,0,0.26),0_2px_5px_rgba(0,0,0,0.12)]";
/** Equal spacing between toolbar controls — gap is measured box-to-box on each flex item. */
const CHAT_TOOLBAR_CONTROL_GAP = "gap-2";
/** Bordered 32×32 icon control (paperclip only). */
const CHAT_TOOLBAR_PAPERCLIP_CHIP = `${TOOLBAR_CHIP} inline-flex h-8 w-8 shrink-0 items-center justify-center`;
/** Usage ring — no chip; fixed row height for alignment with gap-2 siblings. */
const CHAT_TOOLBAR_RING_SLOT = "inline-flex h-8 w-8 shrink-0 items-center justify-center";
/** Dropdown triggers (Agent/Ask, Auto) — shrink-wrap, no extra horizontal width. */
const CHAT_TOOLBAR_TRIGGER_WRAP = "relative inline-flex h-8 shrink-0 items-center";

const CHAT_PANEL_GUTTER_CLASS = "px-4 lg:px-8";
const CHAT_PANEL_GUTTER_MARGIN_CLASS = "mx-4 lg:mx-8";
const CHAT_AVATAR_PX = 44;
const CHAT_AVATAR_LOGO_PX = 32;
const CHAT_AVATAR_SHELL =
  "flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-full bg-[#1d1d1d]";
const ADJUSTMENT_LABELS: Record<AdjustmentKey, string> = {
  exposure: "Exposure",
  contrast: "Contrast",
  blacks: "Blacks",
  whites: "Whites",
  highlights: "Highlights",
  shadows: "Shadows",
  vibrance: "Vibrance",
  saturation: "Saturation",
  temperature: "Temperature",
  tint: "Tint",
  hue: "Hue",
  sharpen: "Sharpen",
  noiseReduction: "Noise Reduction",
  vignette: "Vignette",
  grain: "Grain",
  clarity: "Clarity",
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PendingChange = EditorChange;

type SseEvent =
  | {
      type: "meta";
      lifetimeFreeRemaining: number;
      lifetimeFreeUsed: number;
      creditBalanceAfter: number;
    }
  | { type: "text"; text: string }
  | { type: "progress"; text: string }
  | { type: "adjustments"; adjustments: Partial<Record<AdjustmentKey, number>> }
  | { type: "tools"; plan: ChatToolPlan }
  | { type: "history_error" }
  | { type: "interrupted" }
  | { type: "done" };

interface ChatPanelProps {
  mobileLayout?: boolean;
  onMobileClose?: () => void;
  getWorkspaceImage?: () => Promise<string>;
  getToolContext?: () => EditorToolContext | undefined;
  onExecuteTools?: (plan: ChatToolPlan, execution: ActionExecution) => Promise<string>;
  adjustments: Adjustments;
  onPatch: (patch: Partial<Record<string, number>>) => boolean;
  createEditGuard: () => () => boolean;
  createChatEditGuard: () => () => boolean;
  beginOperation: () => () => void;
  onUndo: () => void;
  imageId?: string;
  /** Current canvas photo — sent to the model as already-available context. */
  canvasImageUrl?: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert a File to a base64 data-URL (for preview) and the raw base64 string
 * (for the API payload, without the `data:...;base64,` prefix).
 */
/** Downscale chat attachments before upload (smaller POST + reliable vision). */
async function prepareChatAttachmentFile(
  file: File,
): Promise<{ dataUrl: string; base64: string; mediaType: string }> {
  const bitmap = await createImageBitmap(file);
  const longest = Math.max(bitmap.width, bitmap.height);
  const scale = longest > CHAT_VISION_MAX_PX ? CHAT_VISION_MAX_PX / longest : 1;
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("Canvas unavailable");
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
  const [header, base64] = dataUrl.split(",");
  const rawType = header.replace("data:", "").replace(";base64", "");
  const mediaType = isChatImageMediaType(rawType) ? rawType : "image/jpeg";
  return { dataUrl, base64, mediaType };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function ChatModelSelector({ disabled }: { disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [selectedModelId, setSelectedModelId] = useState<string>(AVAILABLE_MODELS[0].id);
  const [placement, setPlacement] = useState<"above" | "below">("above");
  const [menuCoords, setMenuCoords] = useState<ReturnType<typeof positionChatPopover> | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  const selectedModel =
    AVAILABLE_MODELS.find((model) => model.id === selectedModelId) ?? AVAILABLE_MODELS[0];

  const updateMenuPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const menuHeight = menuRef.current?.offsetHeight ?? MODEL_MENU_ESTIMATED_HEIGHT;
    const position = positionChatPopover(rect, modelMenuWidthPx(rect.width), menuHeight);
    setPlacement(position.placement);
    setMenuCoords(position);
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    let cancelled = false;
    const frame = requestAnimationFrame(() => {
      if (cancelled) return;
      updateMenuPosition();
      requestAnimationFrame(() => {
        if (!cancelled) updateMenuPosition();
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [open, updateMenuPosition, selectedModelId]);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    }

    function onReposition() {
      updateMenuPosition();
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    window.visualViewport?.addEventListener("resize", onReposition);
    window.visualViewport?.addEventListener("scroll", onReposition);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
      window.visualViewport?.removeEventListener("resize", onReposition);
      window.visualViewport?.removeEventListener("scroll", onReposition);
    };
  }, [open, updateMenuPosition]);

  function handleToggle() {
    if (disabled) return;
    if (!open) updateMenuPosition();
    setOpen((prev) => !prev);
  }

  function handleSelectModel(modelId: string) {
    setSelectedModelId(modelId);
    setOpen(false);
  }

  const menuOffsetY = placement === "above" ? 4 : -4;

  const menu =
    typeof document !== "undefined"
      ? createPortal(
          <AnimatePresence>
            {open && menuCoords && (
              <motion.div
                ref={menuRef}
                key="model-menu"
                role="menu"
                aria-label="Model options"
                initial={{ opacity: 0, y: menuOffsetY }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: menuOffsetY }}
                transition={{ duration: reduceMotion ? 0 : 0.15, ease: "easeOut" }}
                style={{
                  top: menuCoords.top,
                  left: menuCoords.left,
                  width: menuCoords.width,
                  maxHeight: menuCoords.maxHeight,
                }}
                className={[
                  "fixed z-[100] box-border overflow-y-auto rounded-md px-1 py-1",
                  CHAT_POPOVER_CHROME,
                  CHAT_SURFACE_SHADOW,
                ].join(" ")}
              >
                {AVAILABLE_MODELS.map((model) => {
                  const isSelected = model.id === selectedModelId;
                  return (
                    <button
                      key={model.id}
                      type="button"
                      role="menuitemradio"
                      aria-checked={isSelected}
                      onClick={() => handleSelectModel(model.id)}
                      className={[
                        MODEL_MENU_ROW_CLASS,
                        "text-[12px] transition-colors cursor-pointer",
                        isSelected
                          ? "text-[#cccccc]"
                          : "text-[#888888] hover:bg-[#252525] hover:text-[#cccccc]",
                      ].join(" ")}
                    >
                      <span className="min-w-0 shrink-0 font-medium">{model.label}</span>
                      {isSelected ? (
                        <Icon
                          name="Check"
                          size={16}
                          className="shrink-0 text-[#888888]"
                          aria-hidden
                        />
                      ) : (
                        <span className="size-4 shrink-0" aria-hidden />
                      )}
                    </button>
                  );
                })}

                <div
                  role="menuitem"
                  aria-disabled="true"
                  className={`${MODEL_MENU_ROW_CLASS} cursor-default select-none text-[#555555] opacity-60`}
                >
                  <span className="-ml-1.5 min-w-0 shrink-0 rounded-full border border-[#212121] bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-medium leading-none text-[#555555]">
                    {COMING_SOON_MODEL_ROW.badge}
                  </span>
                  <span className="size-4 shrink-0" aria-hidden />
                </div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )
      : null;

  return (
    <div className={`${CHAT_TOOLBAR_TRIGGER_WRAP} -ml-2`}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Model: ${selectedModel.label}`}
        disabled={disabled}
        onClick={handleToggle}
        className={[
          "inline-flex",
          TOOLBAR_CHIP_H,
          "shrink-0 items-center justify-center gap-0.5 rounded-md px-1 text-[12px] transition-colors",
          disabled
            ? "cursor-not-allowed opacity-50"
            : "cursor-pointer hover:bg-white/[0.06]",
          open && !disabled ? "bg-white/[0.06]" : "",
        ].join(" ")}
      >
        <span className="whitespace-nowrap font-semibold leading-none text-[#888888]">
          {selectedModel.label}
        </span>
        <Icon
          name="ChevronDown"
          size={16}
          className={[
            "size-4 shrink-0 -me-px text-[#888888] transition-transform duration-150",
            open ? "rotate-180" : "",
          ].join(" ")}
          aria-hidden
        />
      </button>
      {menu}
    </div>
  );
}

function ChatInteractionModeSelector({
  disabled,
  mode,
  onModeChange,
}: {
  disabled?: boolean;
  mode: ChatInteractionModeId;
  onModeChange: (mode: ChatInteractionModeId) => void;
}) {
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<"above" | "below">("above");
  const [menuCoords, setMenuCoords] = useState<ReturnType<typeof positionChatPopover> | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  const selectedMode = getChatInteractionMode(mode);

  const updateMenuPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const menuHeight = menuRef.current?.offsetHeight ?? INTERACTION_MENU_ESTIMATED_HEIGHT;
    const position = positionChatPopover(rect, interactionMenuWidthPx(rect.width), menuHeight);
    setPlacement(position.placement);
    setMenuCoords(position);
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    let cancelled = false;
    const frame = requestAnimationFrame(() => {
      if (cancelled) return;
      updateMenuPosition();
      requestAnimationFrame(() => {
        if (!cancelled) updateMenuPosition();
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [open, updateMenuPosition, mode]);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    }

    function onReposition() {
      updateMenuPosition();
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    window.visualViewport?.addEventListener("resize", onReposition);
    window.visualViewport?.addEventListener("scroll", onReposition);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
      window.visualViewport?.removeEventListener("resize", onReposition);
      window.visualViewport?.removeEventListener("scroll", onReposition);
    };
  }, [open, updateMenuPosition]);

  function handleToggle() {
    if (disabled) return;
    if (!open) updateMenuPosition();
    setOpen((prev) => !prev);
  }

  function handleSelect(nextMode: ChatInteractionModeId) {
    onModeChange(nextMode);
    setOpen(false);
  }

  const menuOffsetY = placement === "above" ? 4 : -4;

  const menu =
    typeof document !== "undefined"
      ? createPortal(
          <AnimatePresence>
            {open && menuCoords && (
              <motion.div
                ref={menuRef}
                key="interaction-mode-menu"
                role="menu"
                aria-label="Interaction mode options"
                initial={{ opacity: 0, y: menuOffsetY }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: menuOffsetY }}
                transition={{ duration: reduceMotion ? 0 : 0.15, ease: "easeOut" }}
                style={{
                  top: menuCoords.top,
                  left: menuCoords.left,
                  width: menuCoords.width,
                  maxHeight: menuCoords.maxHeight,
                }}
                className={[
                  "fixed z-[100] box-border overflow-y-auto rounded-md px-1 py-1",
                  CHAT_POPOVER_CHROME,
                  CHAT_SURFACE_SHADOW,
                ].join(" ")}
              >
                {CHAT_INTERACTION_MODES.map((option) => {
                  const isSelected = option.id === mode;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      role="menuitemradio"
                      aria-checked={isSelected}
                      onClick={() => handleSelect(option.id)}
                      className={[
                        MODEL_MENU_ROW_CLASS,
                        "text-[12px] transition-colors cursor-pointer",
                        isSelected
                          ? "text-[#cccccc]"
                          : "text-[#888888] hover:bg-[#252525] hover:text-[#cccccc]",
                      ].join(" ")}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <Icon
                          name={option.icon}
                          size={16}
                          className="shrink-0 text-[#888888]"
                          aria-hidden
                        />
                        <span className="shrink-0 font-medium">{option.label}</span>
                      </span>
                      {isSelected ? (
                        <Icon
                          name="Check"
                          size={16}
                          className="shrink-0 text-[#888888]"
                          aria-hidden
                        />
                      ) : (
                        <span className="size-4 shrink-0" aria-hidden />
                      )}
                    </button>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )
      : null;

  return (
    <div className={CHAT_TOOLBAR_TRIGGER_WRAP}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Interaction mode: ${selectedMode.label}`}
        title={selectedMode.description}
        disabled={disabled}
        onClick={handleToggle}
        className={[
          TOOLBAR_CHIP,
          "inline-flex",
          TOOLBAR_CHIP_H,
          "shrink-0 items-center justify-center gap-0.5 pl-2 pr-1.5 text-[12px] transition-colors",
          disabled
            ? "cursor-not-allowed opacity-50"
            : "cursor-pointer hover:border-[#2e2e2e]",
        ].join(" ")}
      >
        <Icon
          name={selectedMode.icon}
          size={16}
          className="size-4 shrink-0 text-[#888888]"
          aria-hidden
        />
        <Icon
          name="ChevronDown"
          size={16}
          className={[
            "size-4 shrink-0 -me-px text-[#888888] transition-transform duration-150",
            open ? "rotate-180" : "",
          ].join(" ")}
          aria-hidden
        />
      </button>
      {menu}
    </div>
  );
}

function ToolbarIconBtn({
  title,
  disabled,
  onClick,
  children,
}: {
  title: string;
  disabled?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className="shrink-0 text-[#888888] hover:text-white transition-colors disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
    >
      {children}
    </button>
  );
}

function ChatMessageAvatar({
  role,
  imageUrl,
}: {
  role: "user" | "assistant";
  imageUrl?: string | null;
}) {
  if (role === "user" && imageUrl) {
    return (
      <Image
        key={imageUrl}
        src={imageUrl}
        alt=""
        width={CHAT_AVATAR_PX}
        height={CHAT_AVATAR_PX}
        className="h-[44px] w-[44px] shrink-0 rounded-full object-cover"
        aria-hidden
      />
    );
  }

  if (role === "assistant") {
    return (
      <div className={CHAT_AVATAR_SHELL} aria-hidden>
        <BrandLogo
          width={CHAT_AVATAR_LOGO_PX}
          height={CHAT_AVATAR_LOGO_PX}
          className="shrink-0"
          decorative
        />
      </div>
    );
  }

  return <div className={CHAT_AVATAR_SHELL} aria-hidden />;
}

export default function ChatPanel({
  mobileLayout = false,
  onMobileClose,
  getWorkspaceImage,
  getToolContext,
  onExecuteTools,
  adjustments,
  onPatch,
  createEditGuard,
  createChatEditGuard,
  beginOperation,
  onUndo,
  imageId,
  canvasImageUrl,
}: ChatPanelProps) {
  const { user } = useUser();
  const { messages, setMessages, historyLoaded, historyLoading, historyError, beforeCursor, loadHistory } = useImageChatHistory(imageId);
  const [historySaveError, setHistorySaveError] = useState(false);
  const [input, setInput] = useState("");
  const [inputFocused, setInputFocused] = useState(false);
  const [sending, setSending] = useState(false);
  const [pendingToolPlan, setPendingToolPlan] = useState<{
    plan: ChatToolPlan; assistantId: string; isCurrent: () => boolean; isUnchanged: () => boolean;
  } | null>(null);
  const toolExecutorRef = useRef(onExecuteTools);
  const toolApprovalInFlightRef = useRef(false);
  toolExecutorRef.current = onExecuteTools;
  const [replyProgress, setReplyProgress] = useState<{ id: string; label: string } | null>(null);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const isCollapsed = !mobileLayout && panelCollapsed;
  const [changesExpanded, setChangesExpanded] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<PendingChange[]>([]);
  const prefersReducedMotion = useReducedMotion();
  const messageDuration = prefersReducedMotion ? 0 : 0.2;
  const messageInitialY = prefersReducedMotion ? 0 : 6;

  const canUndoChatRef = useRef<(() => boolean) | null>(null);
  const undoToolReviewRef = useRef<(() => Promise<void>) | null>(null);
  const [reviewIncludesPaidTools, setReviewIncludesPaidTools] = useState(false);
  const changeSnapshotRef = useRef<Adjustments | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const adjustmentsRef = useRef(adjustments);

  useEffect(() => {
    adjustmentsRef.current = adjustments;
  }, [adjustments]);

  // Attached image state
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [attachedPreview, setAttachedPreview] = useState<string | null>(null);
  const [attachedBase64, setAttachedBase64] = useState<string | null>(null);
  const [attachedMediaType, setAttachedMediaType] = useState<string | null>(null);

  /** Chat quota synced from GET /api/credits and live SSE meta events. */
  const [chatQuota, setChatQuota] = useState<UsageQuotaSnapshot | null>(null);
  const [creditShopOpen, setCreditShopOpen] = useState(false);
  const [chatInteractionMode, setChatInteractionMode] = useState<ChatInteractionModeId>(
    DEFAULT_CHAT_INTERACTION_MODE,
  );

  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const olderScrollRef = useRef<{ height: number; top: number } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const openCreditShop = useCallback(() => {
    setCreditShopOpen(true);
  }, []);

  const refreshChatQuota = useCallback(() => {
    void fetch("/api/credits")
      .then((r) => r.json())
      .then((data) => {
        const next = quotaFromApi(data);
        if (next) setChatQuota(next);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshChatQuota();
    function onVisibility() {
      if (document.visibilityState === "visible") refreshChatQuota();
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [refreshChatQuota]);

  /** Hard block only when lifetime free is exhausted and balance is exactly zero. */
  const chatBlocked = isChatQuotaBlocked(chatQuota);

  // Keep the reader in place when older messages are prepended.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const older = olderScrollRef.current;
    el.scrollTop = older ? older.top + el.scrollHeight - older.height : el.scrollHeight;
    olderScrollRef.current = null;
  }, [messages]);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function loadOlderMessages() {
    if (!beforeCursor || historyLoading || sending) return;
    const el = scrollRef.current;
    if (el) olderScrollRef.current = { height: el.scrollHeight, top: el.scrollTop };
    const loaded = await loadHistory(beforeCursor);
    if (!loaded) olderScrollRef.current = null;
  }

  function applyAiAdjustments(rawPatch: Partial<Record<string, number>>) {
    const patch = normalizeAdjustmentPatch(rawPatch);
    const keys = Object.keys(patch) as AdjustmentKey[];
    if (keys.length === 0 || !onPatch(patch)) return;
    undoToolReviewRef.current = null;
    setReviewIncludesPaidTools(false);

    if (!changeSnapshotRef.current) {
      changeSnapshotRef.current = { ...adjustmentsRef.current };
    }

    setPendingChanges((prev) => {
      const next = [...prev];
      for (const key of keys) {
        const to = patch[key];
        if (typeof to !== "number") continue;
        const from = changeSnapshotRef.current![key];
        const existingIdx = next.findIndex((c) => c.key === key);
        if (existingIdx >= 0) {
          next[existingIdx] = { key, label: ADJUSTMENT_LABELS[key], from, to };
        } else {
          next.push({ key, label: ADJUSTMENT_LABELS[key], from, to });
        }
      }
      return next;
    });

    canUndoChatRef.current = createEditGuard();
  }

  function reviewToolChanges(review: EditorChangeReview) {
    setPendingChanges(review.changes);
    setChangesExpanded(false);
    changeSnapshotRef.current = null;
    canUndoChatRef.current = review.canUndo;
    undoToolReviewRef.current = review.undo;
    setReviewIncludesPaidTools(review.includesPaidTools);
  }

  async function handleUndoAllChanges() {
    if (sending) return;
    if (!canUndoChatRef.current?.()) {
      toast.error("The image has changed since these edits. Use History to revert them.");
      return;
    }
    setSending(true);
    try {
      if (undoToolReviewRef.current) await undoToolReviewRef.current();
      else onUndo();
      handleKeepAllChanges();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not revert these edits.");
    } finally { setSending(false); }
  }

  function handleKeepAllChanges() {
    canUndoChatRef.current = null;
    undoToolReviewRef.current = null;
    setReviewIncludesPaidTools(false);
    setPendingChanges([]);
    setChangesExpanded(false);
    changeSnapshotRef.current = null;
  }

  // ── File attachment ─────────────────────────────────────────────────────
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    e.target.value = "";
    if (!file) return;

    setAttachedFile(file);
    try {
      const { dataUrl, base64, mediaType } = await prepareChatAttachmentFile(file);
      setAttachedPreview(dataUrl);
      setAttachedBase64(base64);
      setAttachedMediaType(mediaType);
    } catch {
      toast.error("Could not read the image file.");
      setAttachedFile(null);
    }
  }

  function clearAttachment() {
    setAttachedFile(null);
    setAttachedPreview(null);
    setAttachedBase64(null);
    setAttachedMediaType(null);
  }

  function handleCancelGeneration() {
    abortRef.current?.abort();
  }

  function promptPurchaseCredits() {
    openCreditShop();
    toast.custom(
      (t) => (
        <div
          {...t.ariaProps}
          className={TOAST_SHELL_CLASS}
          style={{ animation: toastAnimation(t.visible) }}
        >
          <span>Purchase credits to continue chatting</span>
          <button
            type="button"
            className="underline underline-offset-2 font-medium whitespace-nowrap cursor-pointer"
            onClick={() => {
              toast.dismiss(t.id);
              openCreditShop();
            }}
          >
            Purchase credits →
          </button>
        </div>
      ),
      { duration: 5000 },
    );
  }

  // ── Send message ────────────────────────────────────────────────────────
  async function handleSend(overrideText?: string) {
    const text = (overrideText ?? input).trim();
    if (!text || sending || pendingToolPlan || !historyLoaded) return;
    if (chatBlocked) {
      promptPurchaseCredits();
      return;
    }

    const imagePreview = attachedPreview ?? undefined;
    const imageBase64 = attachedBase64 ?? undefined;
    const imageMediaType = attachedMediaType ?? undefined;

    const conversationHistory: ChatHistoryMessage[] = imageId ? [] : messages
      .filter((m) => m.content.trim())
      .slice(-20)
      .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
    const allowAdjustments = allowChatAdjustmentsForTurn(chatInteractionMode);

    const turnId = createUuid();
    const userMsg: Message = {
      id: `${turnId}:user`,
      role: "user",
      content: text,
      imagePreview,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    clearAttachment();
    setSending(true);

    const assistantId = `${turnId}:assistant`;
    setReplyProgress({
      id: assistantId,
      label: initialChatProgress(chatInteractionMode, !!(canvasImageUrl || imageBase64)),
    });
    const assistantPlaceholder: Message = {
      id: assistantId,
      role: "assistant",
      content: "",
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, assistantPlaceholder]);

    const isCurrent = createChatEditGuard();
    const isUnchanged = onExecuteTools ? createEditGuard() : () => true;
    const finishOperation = allowAdjustments ? beginOperation() : () => {};
    const turnPatch: Partial<Record<AdjustmentKey, number>> = {};
    let toolPlan: ChatToolPlan | undefined;
    let completed = false;
    let interrupted = false;
    let receivedText = "";
    setHistorySaveError(false);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const workspaceImage = getWorkspaceImage ? await getWorkspaceImage() : canvasImageUrl;
      if (onExecuteTools && !isUnchanged()) throw new Error("The image changed while preparing this request. Send it again.");
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userMessage: text,
          turnId,
          adjustments,
          conversationHistory,
          imageId,
          workspaceImageUrl: workspaceImage ?? undefined,
          imageBase64,
          imageMediaType,
          chatInteractionMode,
          toolsEnabled: !!onExecuteTools && !!imageId,
          editorContext: getToolContext?.(),
        }),
        signal: controller.signal,
      });

      if (res.status === 429) {
        toast("Too many requests. Please slow down.", { icon: "⏱" });
        setMessages((prev) => prev.filter((m) => m.id !== assistantId));
        return;
      }

      if (res.status === 402) {
        promptPurchaseCredits();
        setMessages((prev) => prev.filter((m) => m.id !== assistantId));
        return;
      }

      if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try {
          const errBody = (await res.json()) as { error?: string };
          if (errBody.error) detail = errBody.error;
        } catch {
          /* non-JSON error body */
        }
        throw new Error(detail);
      }

      const decoder = new TextDecoder();
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      let rawBuffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          rawBuffer += decoder.decode(value, { stream: true });

          const lines = rawBuffer.split("\n\n");
          rawBuffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const jsonStr = line.slice(6);
            let event: SseEvent;
            try {
              event = JSON.parse(jsonStr) as SseEvent;
            } catch {
              continue;
            }

            if (event.type === "meta") {
              setChatQuota((prev) => ({
                lifetimeFreeUsed: event.lifetimeFreeUsed,
                creditBalance: event.creditBalanceAfter,
                totalPurchasedCredits: prev?.totalPurchasedCredits ?? 0,
                hasPurchasedCredits: prev?.hasPurchasedCredits ?? false,
              }));
            } else if (event.type === "history_error") {
              setHistorySaveError(true);
            } else if (event.type === "progress") {
              if (event.text.trim()) {
                setReplyProgress((current) => current?.id === assistantId ? { id: assistantId, label: event.text.trim().slice(0, 180) } : current);
              }
            } else if (event.type === "interrupted") {
              interrupted = true;
              setReplyProgress(null);
              setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, interrupted: true } : m));
            } else if (event.type === "text") {
              setReplyProgress((current) => current?.id === assistantId && current.label === CHAT_PROGRESS_LABELS.waiting
                ? { ...current, label: CHAT_PROGRESS_LABELS.thinking } : current);
              // Keep the task summary in front while the complete result is prepared.
              // Publish the answer only after completion and any edits are committed.
              receivedText += event.text;
            } else if (event.type === "done") {
              completed = true;
            } else if (event.type === "adjustments") {
              if (allowAdjustments) {
                Object.assign(turnPatch, event.adjustments);
              }
            } else if (event.type === "tools" && allowAdjustments && onExecuteTools) {
              const parsedPlan = editorPlanSchema.parse({ actions: event.plan.actions });
              if (event.plan.turnId !== turnId) throw new Error("Tool request did not match this message");
              toolPlan = { ...event.plan, ...parsedPlan };
            }
          }
        }
      } finally {
        void reader.cancel().catch(() => {
          /* already closed / lock released — ignore */
        });
      }

      if (completed && !interrupted && !controller.signal.aborted && isCurrent() && toolPlan) {
        if (toolPlan.credits > 0) {
          setPendingToolPlan({ plan: toolPlan, assistantId, isCurrent, isUnchanged });
          receivedText = "Review the tool costs below, then apply the edits when you are ready. These costs are separate from your chat message.";
        } else {
          receivedText = await toolExecutorRef.current!(toolPlan, { signal: controller.signal, isCurrent, isUnchanged,
            reviewChanges: reviewToolChanges,
            progress: (label) => setReplyProgress({ id: assistantId, label }) });
        }
      } else if (completed && !interrupted && !controller.signal.aborted && isCurrent() && Object.keys(turnPatch).length > 0) {
        changeSnapshotRef.current = null;
        setPendingChanges([]);
        flushSync(() => {
          setReplyProgress({ id: assistantId, label: CHAT_PROGRESS_LABELS.applying });
          applyAiAdjustments(turnPatch);
        });
      }

      setMessages((prev) => prev.map((message) => message.id === assistantId ? {
        ...message, content: cleanText(receivedText),
        interrupted: interrupted || !completed || controller.signal.aborted,
      } : message));

    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setMessages((prev) =>
          prev.map((m) => m.id === assistantId ? { ...m, content: cleanText(receivedText), interrupted: true } : m),
        );
        return;
      }
      console.error("[ChatPanel] send error:", err);
      const fallback = "Something went wrong. Please try again.";
      const message =
        err instanceof Error && err.message && !err.message.startsWith("HTTP")
          ? err.message
          : fallback;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                interrupted: true,
                content:
                  chatInteractionMode === "ask" && askModeNudgeMissing(message)
                    ? `${message}\n\n${ASK_SWITCH_TO_AGENT_NUDGE}`
                    : message,
              }
            : m,
        ),
      );
    } finally {
      setReplyProgress(null);
      finishOperation();
      abortRef.current = null;
      setSending(false);
      refreshChatQuota();
    }
  }

  async function handleToolApproval(approve: boolean) {
    const pending = pendingToolPlan;
    if (!pending || sending || toolApprovalInFlightRef.current) return;
    if (approve && chatInteractionMode !== "agent") { toast.error("Switch to Agent mode to apply these edits."); return; }
    toolApprovalInFlightRef.current = true;
    setSending(true);
    const controller = new AbortController();
    abortRef.current = controller;
    const finish = approve ? beginOperation() : () => {};
    try {
      if (!approve) {
        await chatToolsRequest({ phase: "cancel", turnId: pending.plan.turnId }, controller.signal);
        setMessages((prev) => prev.map((m) => m.id === pending.assistantId ? { ...m, content: "Edits cancelled. No tools were run." } : m));
      } else {
        setMessages((prev) => prev.map((m) => m.id === pending.assistantId ? { ...m, content: "" } : m));
        setReplyProgress({ id: pending.assistantId, label: CHAT_PROGRESS_LABELS.applying });
        const result = await toolExecutorRef.current!(pending.plan, { signal: controller.signal,
          reviewChanges: reviewToolChanges,
          isCurrent: pending.isCurrent, isUnchanged: pending.isUnchanged,
          progress: (label) => setReplyProgress({ id: pending.assistantId, label }) });
        setMessages((prev) => prev.map((m) => m.id === pending.assistantId ? { ...m, content: result } : m));
      }
      setPendingToolPlan(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not execute these edits.";
      setMessages((prev) => prev.map((m) => m.id === pending.assistantId ? { ...m, content: message, interrupted: true } : m));
      setPendingToolPlan(null);
    } finally {
      toolApprovalInFlightRef.current = false;
      finish(); setReplyProgress(null); setSending(false); abortRef.current = null; refreshChatQuota();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  const canSend = !!input.trim() && !sending && !pendingToolPlan && !chatBlocked && historyLoaded;

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div
      className={[
        "editor-chat-panel flex flex-col shrink-0 h-full min-w-0 overflow-hidden transition-[width] duration-200 ease-out w-[var(--chat-width)]",
        "bg-[#121212] border-l border-[#212121] rounded-l-2xl",
      ].join(" ")}
      style={{ "--chat-width": `${isCollapsed ? CHAT_PANEL_COLLAPSED_WIDTH_PX : CHAT_PANEL_WIDTH_PX}px` } as CSSProperties}
    >
      {/* Panel header */}
      <div
        className={[
          PANEL_HEADER,
          "relative",
          isCollapsed ? "justify-center px-0" : "px-8",
        ].join(" ")}
      >
        {isCollapsed ? (
          <button
            type="button"
            aria-expanded={false}
            aria-label="Expand chat panel"
            onClick={() => setPanelCollapsed(false)}
            className="shrink-0 text-[#888888] hover:text-white transition-colors cursor-pointer"
          >
            <Icon name="ChevronLeft" size={16} aria-hidden={false} aria-label="Collapse chat panel" />
          </button>
        ) : (
          <>
            <span className={PANEL_TITLE}>Chat</span>
            <button
              type="button"
              aria-expanded
              aria-label={mobileLayout ? "Close chat panel" : "Collapse chat panel"}
              onClick={() => mobileLayout ? onMobileClose?.() : setPanelCollapsed(true)}
              className={mobileLayout
                ? "ml-auto -mr-2 lg:hidden text-[#888888] p-2 cursor-pointer"
                : "absolute left-[18px] top-1/2 flex items-center justify-center shrink-0 -translate-x-1/2 -translate-y-1/2 text-[#888888] hover:text-white transition-colors cursor-pointer"}
            >
              <Icon name={mobileLayout ? "ChevronDown" : "ChevronRight"} size={mobileLayout ? 20 : 16} aria-hidden />
            </button>
          </>
        )}
      </div>

      {!isCollapsed && (
        <div className="editor-chat-content flex flex-col flex-1 min-h-0 min-w-0 overflow-hidden">
          {/* Message thread */}
          <div
            ref={scrollRef}
            data-chat-scroll
            className={`chat-panel-scroll flex-1 overflow-y-auto min-h-0 py-5 flex flex-col gap-10 ${CHAT_PANEL_GUTTER_CLASS}`}
          >
            {historyLoading && !historyLoaded && (
              <div className="flex flex-1 items-center justify-center">
                <LoadingSpinner size="md" label="Loading chat history" />
              </div>
            )}
            {historyError && (
              <div className="text-[12px] text-[#888888]" role="alert">
                {historyError}{" "}
                <button type="button" className="underline cursor-pointer" disabled={historyLoading}
                  onClick={() => { void (historyLoaded ? loadOlderMessages() : loadHistory()); }}>Retry</button>
              </div>
            )}
            {beforeCursor !== null && !historyError && (
              <button type="button" onClick={() => void loadOlderMessages()} disabled={historyLoading || sending}
                className="text-[12px] text-[#888888] hover:text-white cursor-pointer disabled:opacity-50">
                {historyLoading ? <LoadingSpinner size="sm" label="Loading older messages" /> : "Load older messages"}
              </button>
            )}
            {historySaveError && <p role="alert" className="text-[12px] text-[#888888]">This response could not be saved. Your earlier messages are still stored.</p>}
            {messages.length === 0 && historyLoaded && (
              <ChatEmptyState
                disabled={sending || chatBlocked}
                onSelectSuggestion={(message) => {
                  void handleSend(message);
                }}
              />
            )}

            {messages.map((msg) => {
              const isAssistantLoading =
                msg.role === "assistant" && msg.content === "" && replyProgress?.id === msg.id && !msg.interrupted;

              return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: messageInitialY }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: messageDuration, ease: "easeOut" }}
                className="flex w-full flex-col items-start gap-[4px]"
              >
                <div className="flex w-full items-start gap-5">
                  <ChatMessageAvatar
                    role={msg.role}
                    imageUrl={msg.role === "user" ? user?.imageUrl : undefined}
                  />
                  <div className="relative flex min-w-0 flex-1 flex-col gap-1">
                    {pendingToolPlan?.assistantId === msg.id && !sending && (
                      <div className="mb-2 rounded-lg border border-[#262626] bg-[#1d1d1d] p-3 text-[13px] text-[#e5e5e5]">
                        <ul className="space-y-2">
                          {pendingToolPlan.plan.actions.map((action, index) => <li key={index} className="flex justify-between gap-3">
                            <span>{actionLabel(action)}</span><span className="shrink-0 text-[#888888]">{actionCost(action)} credits</span>
                          </li>)}
                        </ul>
                        <div className="mt-3 flex gap-2">
                          <button type="button" onClick={() => void handleToolApproval(true)} className={BTN_PRIMARY_COMPACT}>Apply · {pendingToolPlan.plan.credits} credits</button>
                          <button type="button" onClick={() => void handleToolApproval(false)} className="px-3 text-[#888888] hover:text-white cursor-pointer">Cancel</button>
                        </div>
                      </div>
                    )}
                    <AnimatePresence mode="wait" initial={false}>
                      {isAssistantLoading ? (
                        <motion.div
                          key={`${msg.id}-loading`}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: messageDuration }}
                          className="flex items-center py-2.5"
                        >
                          <ShimmerText
                            label={replyProgress?.label ?? CHAT_ASSISTANT_LOADING_LABEL}
                            className={`${CHAT_STATUS_TEXT_CLASS} ${CHAT_STATUS_TEXT_COLOR_CLASS}`}
                          />
                        </motion.div>
                      ) : (
                        <motion.div
                          key={`${msg.id}-content`}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: messageDuration }}
                          className="flex min-w-0 flex-1 flex-col gap-1"
                        >
                          {msg.imagePreview && (
                            <div>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={msg.imagePreview}
                                alt="Attached reference"
                                className="max-h-[100px] rounded-lg object-cover border border-[#212121]"
                                style={{ maxWidth: CHAT_MESSAGE_ATTACHMENT_MAX_WIDTH_PX }}
                              />
                            </div>
                          )}
                          <div
                            className={`min-w-0 whitespace-pre-wrap break-words ${
                              msg.role === "user"
                                ? "text-[14px] font-normal leading-snug text-white"
                                : "leading-relaxed rounded-lg px-3 py-2.5 text-[14px] bg-[#1d1d1d] text-[#e5e5e5]"
                            }`}
                          >
                            {msg.role === "assistant" ? (
                              <ChatMarkdown content={msg.content || (msg.interrupted ? "Response interrupted. Send another message to continue." : "")} />
                            ) : (
                              msg.content
                            )}
                          </div>
                          {msg.interrupted && msg.content && <p className="text-[11px] text-[#888888]">Response interrupted. Edits may not have been applied.</p>}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </motion.div>
              );
            })}
          </div>

          {/* Changes indicator bar */}
          <AnimatePresence initial={false}>
            {!sending && !replyProgress && !pendingToolPlan && pendingChanges.length > 0 && (
              <motion.div
                key="chat-changes"
                initial={{ opacity: prefersReducedMotion ? 1 : 0, y: prefersReducedMotion ? 0 : 8, height: 0, marginBottom: 0 }}
                animate={{ opacity: 1, y: 0, height: "auto", marginBottom: 8 }}
                exit={{ opacity: 0, y: prefersReducedMotion ? 0 : 8, height: 0, marginBottom: 0,
                  transition: { duration: prefersReducedMotion ? 0 : 0.12, delay: 0, ease: "easeOut" } }}
                // The thinking indicator exits, then the reply fades in before the review enters.
                transition={{ duration: prefersReducedMotion ? 0 : 0.12, delay: messageDuration * 2, ease: "easeOut" }}
                onAnimationComplete={() => {
                  const scroll = scrollRef.current;
                  if (scroll) scroll.scrollTop = scroll.scrollHeight;
                }}
                className={`${CHAT_PANEL_GUTTER_MARGIN_CLASS} shrink-0 overflow-hidden rounded-md border border-[#212121] bg-white/[0.04] ${CHAT_SURFACE_SHADOW}`}
              >
                <div className="flex items-center gap-2 px-3 py-2 min-w-0">
                  <button
                    type="button"
                    aria-expanded={changesExpanded}
                    aria-label={changesExpanded ? "Collapse changes" : "Expand changes"}
                    onClick={() => setChangesExpanded((prev) => !prev)}
                    className="flex min-w-0 items-center gap-2 text-[#888888] hover:text-white transition-colors cursor-pointer"
                  >
                    <Icon
                      name="ChevronRight"
                      size={16}
                      className={[
                        "transition-transform duration-150",
                        changesExpanded ? "rotate-90" : "",
                      ].join(" ")}
                      aria-hidden
                    />
                    <span className="min-w-0 truncate text-[13px] font-medium">
                      {pendingChanges.length} Change{pendingChanges.length !== 1 ? "s" : ""}
                    </span>
                  </button>

                  <div className="chat-change-actions ml-auto flex shrink-0 items-center gap-2">
                    <button type="button" disabled={sending} onClick={() => void handleUndoAllChanges()} className={BTN_SECONDARY}>
                      Undo all
                    </button>
                    <button type="button" disabled={sending} onClick={handleKeepAllChanges} className={BTN_PRIMARY_COMPACT}>
                      Keep all
                    </button>
                  </div>
                </div>

                <AnimatePresence initial={false}>
                  {changesExpanded && (
                    <motion.div
                      key="chat-change-details"
                      initial={{ height: 0, opacity: prefersReducedMotion ? 1 : 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: prefersReducedMotion ? 0 : 0.12, ease: "easeOut" }}
                      className="overflow-hidden"
                    >
                      <div className="chat-change-details max-h-48 overflow-y-auto border-t border-[#212121] px-3 py-2 space-y-1.5">
                        {pendingChanges.map((change) => (
                          <div
                            key={change.key}
                            className="text-[12px] font-medium text-[#888888] leading-snug"
                          >
                            {change.label}: {change.from !== undefined ? <>{change.from} → </> : null}{change.to}
                          </div>
                        ))}
                        {reviewIncludesPaidTools && <p className="text-[11px] text-[#888888]">Undoing edits does not refund tool credits.</p>}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Input composite — pinned to bottom */}
          <div className={`chat-composer shrink-0 pb-4 pt-2 ${CHAT_PANEL_GUTTER_CLASS}`}>
            {attachedPreview && (
              <div className="pb-2">
                <div className="relative inline-block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={attachedPreview}
                    alt="Attached"
                    className="h-[56px] w-auto rounded-lg object-cover border border-[#212121]"
                    style={{ maxWidth: CHAT_INPUT_ATTACHMENT_MAX_WIDTH_PX }}
                  />
                  <button
                    type="button"
                    onClick={clearAttachment}
                    className="absolute -top-[6px] -right-[6px] w-[16px] h-[16px] rounded-full bg-white/[0.12] border border-white/[0.2] flex items-center justify-center text-white/70 hover:text-white hover:bg-white/[0.2] transition-colors"
                  >
                    <Icon name="XClose" size={16} aria-hidden />
                  </button>
                </div>
                {attachedFile && (
                  <p
                    className="text-[10px] text-[#555555] mt-[3px] truncate"
                    style={{ maxWidth: CHAT_ATTACHMENT_FILENAME_MAX_WIDTH_PX }}
                  >
                    {attachedFile.name}
                  </p>
                )}
              </div>
            )}

            {chatBlocked && (
              <p className="pb-2 text-[12px] text-[#666666] leading-snug">
                {chatQuota?.hasPurchasedCredits
                  ? "You're out of credits. "
                  : "Free messages used. "}
                <button
                  type="button"
                  onClick={openCreditShop}
                  className="text-[#a3a3a3] underline underline-offset-2 hover:text-white cursor-pointer"
                >
                  {chatQuota?.hasPurchasedCredits
                    ? "Purchase more credits"
                    : "Purchase credits"}
                </button>{" "}
                to continue chatting.
              </p>
            )}

            <div
              className={`overflow-hidden rounded-xl border-2 bg-[#1d1d1d] transition-colors ${inputFocused ? BRAND_BORDER_CLASS : "border-[#262626]"} ${CHAT_SURFACE_SHADOW}`}
            >
              {/* Upper input field */}
              <div className="chat-composer-field flex min-h-[76px] items-start px-4 pt-3 pb-3">
                <div className="flex w-full items-center gap-3.5">
                  <BrandLogo
                    width={46}
                    height={46}
                    className="shrink-0 -translate-y-1"
                    decorative
                  />
                  <div className="relative min-w-0 flex-1">
                    {chatBlocked && !input && (
                      <span
                        className="pointer-events-none absolute left-0 top-0 text-[15px] font-normal leading-snug text-[#666666]"
                        aria-hidden
                      >
                        {chatQuota?.hasPurchasedCredits
                          ? "Purchase more credits to continue chatting..."
                          : "Purchase credits to continue chatting..."}
                      </span>
                    )}
                    <textarea
                      ref={textareaRef}
                      aria-label="Message"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onFocus={() => setInputFocused(true)}
                      onBlur={() => setInputFocused(false)}
                      onKeyDown={handleKeyDown}
                      placeholder={
                        chatBlocked ? "" : "Describe the edit you want..."
                      }
                      rows={1}
                      disabled={chatBlocked || !historyLoaded}
                      className="w-full resize-none bg-transparent pt-0 text-[15px] font-normal text-white placeholder:text-[#666666] placeholder:font-normal outline-none leading-snug min-h-[24px] max-h-[80px] overflow-y-auto disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{ fieldSizing: "content" } as React.CSSProperties}
                    />
                  </div>
                </div>
              </div>

              {/* Lower toolbar row */}
              <div className="chat-composer-toolbar flex items-center justify-between gap-2 border-t border-[#212121] px-4 pb-3 pt-3">
                <div
                  className={`chat-composer-tools flex min-w-0 shrink-0 items-center ${CHAT_TOOLBAR_CONTROL_GAP}`}
                >
                  <div className={CHAT_TOOLBAR_PAPERCLIP_CHIP}>
                    <ToolbarIconBtn
                      title="Attach reference image"
                      disabled={chatBlocked}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Icon name="Paperclip" size={16} aria-hidden />
                    </ToolbarIconBtn>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => { void handleFileChange(e); }}
                    />
                  </div>

                  <ChatInteractionModeSelector
                    disabled={chatBlocked || sending}
                    mode={chatInteractionMode}
                    onModeChange={setChatInteractionMode}
                  />

                  <div className={CHAT_TOOLBAR_RING_SLOT}>
                    <UsageRing
                      quota={chatQuota}
                      onPurchaseClick={openCreditShop}
                      reduceMotion={!!prefersReducedMotion}
                    />
                  </div>

                  <ChatModelSelector disabled={chatBlocked} />
                </div>

                <div className="flex shrink-0 items-center">
                  {sending ? (
                    <div className={`${TOOLBAR_CHIP} flex ${TOOLBAR_CHIP_H} w-8 items-center justify-center`}>
                      <button
                        type="button"
                        onClick={handleCancelGeneration}
                        title="Stop generation"
                        className="inline-flex items-center justify-center text-white/90 hover:text-white transition-colors cursor-pointer"
                      >
                        <Icon name="Stop" size={16} aria-hidden />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => { void handleSend(); }}
                      disabled={!canSend}
                      title="Send"
                      className={[
                        canSend
                          ? BTN_BRAND_ICON
                          : "shrink-0 flex items-center justify-center w-7 h-7 rounded-md bg-white/[0.08] text-[#666666] opacity-50 cursor-not-allowed",
                      ].join(" ")}
                    >
                      <Icon name="Send01" size={16} strokeWidth={2} aria-hidden />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {creditShopOpen && (
        <CreditShopModal
          open={creditShopOpen}
          onClose={() => {
            setCreditShopOpen(false);
            refreshChatQuota();
          }}
        />
      )}
    </div>
  );
}
