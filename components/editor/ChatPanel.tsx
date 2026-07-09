"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Image from "next/image";
import { Icon } from "@/components/shared/Icon";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import toast from "react-hot-toast";
import type { Adjustments } from "@/hooks/useEditor";
import type { AdjustmentKey } from "@/constants/adjustments";
import { normalizeAdjustmentPatch } from "@/constants/adjustments";
import { BTN_PRIMARY_ICON, BTN_PRIMARY_SOLID } from "@/lib/button-styles";
import { TOAST_SHELL_CLASS } from "@/lib/toast-styles";

const USER_CHAT_BUBBLE_CLASS =
  "rounded-xl border border-white/[0.08] bg-[#1e0d3a] text-[13px] font-medium text-white py-2.5 px-4";

const BTN_SECONDARY =
  "inline-flex items-center justify-center h-8 px-3.5 rounded-md border border-white/[0.08] bg-white/[0.05] text-[12px] font-semibold text-white/90 hover:bg-white/[0.09] hover:border-white/[0.15] transition-colors cursor-pointer select-none disabled:opacity-40 disabled:cursor-not-allowed";

const AVAILABLE_MODELS = [
  { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5" },
] as const;

const COMING_SOON_MODEL_ROW = {
  id: "coming-soon",
  badge: "Coming soon",
} as const;

const MODEL_MENU_ESTIMATED_HEIGHT = 72;
const FREE_MESSAGE_ALLOWANCE = 20;
const USAGE_TOOLTIP_DELAY_MS = 125;

/** Reference-matched surfaces — Redux dark palette, Adam proportions/weight. */
const CHAT_SURFACE_SHADOW =
  "shadow-[0_1px_3px_rgba(0,0,0,0.32),0_2px_8px_rgba(0,0,0,0.14)]";
const TOOLBAR_CHIP_H = "h-8";
const TOOLBAR_CHIP =
  "rounded-md border border-white/[0.08] bg-white/[0.05] shadow-[0_1px_2px_rgba(0,0,0,0.26),0_2px_5px_rgba(0,0,0,0.12)]";
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
interface Message {
  id: string;
  role: "user" | "assistant";
  /** Cleaned display text (adjustment tags stripped). */
  content: string;
  /** Base64 data-URL thumbnail for images sent by the user. */
  imagePreview?: string;
  timestamp: Date;
}

interface PendingChange {
  key: AdjustmentKey;
  label: string;
  from: number;
  to: number;
}

type SseEvent =
  | { type: "meta"; lifetimeFreeRemaining: number; creditBalanceAfter: number }
  | { type: "text"; text: string }
  | { type: "adjustments"; adjustments: Partial<Record<AdjustmentKey, number>> }
  | { type: "done" };

interface ChatPanelProps {
  adjustments: Adjustments;
  onPatch: (patch: Partial<Record<string, number>>) => void;
  imageId?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Strip [adjustments]...[/adjustments] from displayed text. */
function cleanText(raw: string): string {
  return raw.replace(/\[adjustments\][\s\S]*?\[\/adjustments\]/g, "").trim();
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/**
 * Convert a File to a base64 data-URL (for preview) and the raw base64 string
 * (for the API payload, without the `data:...;base64,` prefix).
 */
async function fileToBase64(
  file: File,
): Promise<{ dataUrl: string; base64: string; mediaType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const [header, base64] = dataUrl.split(",");
      const mediaType = header.replace("data:", "").replace(";base64", "");
      resolve({ dataUrl, base64, mediaType });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Free-chat usage ring
// ---------------------------------------------------------------------------

const RING_RADIUS = 7.5;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const RING_TRANSITION_MS = 500;

function ringOffsetForRemaining(remaining: number, total: number): number {
  const progress = Math.max(0, Math.min(1, remaining / total));
  return RING_CIRCUMFERENCE * (1 - progress);
}

function FreeChatUsageRing({
  remainingFreeChats,
  totalFreeChats,
  reduceMotion,
}: {
  remainingFreeChats: number;
  totalFreeChats: number;
  reduceMotion: boolean;
}) {
  const targetOffset = ringOffsetForRemaining(remainingFreeChats, totalFreeChats);
  const isEmpty = remainingFreeChats === 0;
  const [displayOffset, setDisplayOffset] = useState<number | null>(null);
  const [transitionEnabled, setTransitionEnabled] = useState(false);
  const hasInitializedRef = useRef(false);

  useEffect(() => {
    if (!hasInitializedRef.current) {
      hasInitializedRef.current = true;
      setDisplayOffset(RING_CIRCUMFERENCE);
      if (reduceMotion) {
        setTransitionEnabled(true);
        setDisplayOffset(targetOffset);
        return;
      }
      const frame = requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setTransitionEnabled(true);
          setDisplayOffset(targetOffset);
        });
      });
      return () => cancelAnimationFrame(frame);
    }

    setDisplayOffset(targetOffset);
  }, [remainingFreeChats, totalFreeChats, targetOffset, reduceMotion]);

  const strokeTransition = transitionEnabled && !reduceMotion
    ? `stroke-dashoffset ${RING_TRANSITION_MS}ms ease-out`
    : "none";

  return (
    <svg
      viewBox="0 0 20 20"
      className="h-5 w-5 shrink-0"
      aria-hidden
    >
      <g transform="rotate(-90 10 10)">
        <circle
          cx="10"
          cy="10"
          r={RING_RADIUS}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={
            isEmpty
              ? "text-[#666666] animate-pulse"
              : "text-[#444444]"
          }
        />
        <circle
          cx="10"
          cy="10"
          r={RING_RADIUS}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={displayOffset ?? RING_CIRCUMFERENCE}
          style={{ transition: strokeTransition }}
          className="text-[#888888]"
        />
      </g>
    </svg>
  );
}

function UsageRingLoading() {
  return (
    <svg viewBox="0 0 20 20" className="h-5 w-5 shrink-0" aria-hidden>
      <circle
        cx="10"
        cy="10"
        r={RING_RADIUS}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="text-[#444444]"
      />
    </svg>
  );
}

function UsageRingWithTooltip({
  remainingFreeChats,
  totalFreeChats,
  reduceMotion,
}: {
  remainingFreeChats: number | null;
  totalFreeChats: number;
  reduceMotion: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const [isCoarsePointer, setIsCoarsePointer] = useState(false);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    setIsCoarsePointer(mq.matches);
    const onChange = () => setIsCoarsePointer(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!visible || !isCoarsePointer) return;
    function onDocumentPointerDown(e: PointerEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) {
        setVisible(false);
      }
    }
    document.addEventListener("pointerdown", onDocumentPointerDown);
    return () => document.removeEventListener("pointerdown", onDocumentPointerDown);
  }, [visible, isCoarsePointer]);

  function clearHoverTimer() {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  }

  function showTooltip() {
    clearHoverTimer();
    hoverTimerRef.current = setTimeout(() => setVisible(true), USAGE_TOOLTIP_DELAY_MS);
  }

  function hideTooltip() {
    clearHoverTimer();
    setVisible(false);
  }

  function handleMouseEnter() {
    if (isCoarsePointer) return;
    showTooltip();
  }

  function handleMouseLeave() {
    if (isCoarsePointer) return;
    hideTooltip();
  }

  function handleFocus() {
    showTooltip();
  }

  function handleBlur() {
    hideTooltip();
  }

  function handleClick() {
    if (!isCoarsePointer) return;
    setVisible((prev) => !prev);
  }

  const ariaLabel =
    remainingFreeChats === null
      ? "Loading free chat allowance"
      : `${remainingFreeChats} of ${totalFreeChats} free chats left`;

  const tooltipText =
    remainingFreeChats === null
      ? "Loading…"
      : `${remainingFreeChats} of ${totalFreeChats} free chats left`;

  return (
    <div
      ref={wrapperRef}
      className="relative shrink-0"
      tabIndex={0}
      role="img"
      aria-label={ariaLabel}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onClick={handleClick}
    >
      {visible && (
        <div
          role="tooltip"
          className={[
            "absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap",
            "rounded-md border border-white/[0.08] bg-[#111111] px-3 py-2",
            CHAT_SURFACE_SHADOW,
          ].join(" ")}
        >
          <p className="text-[12px] text-[#888888] leading-snug">{tooltipText}</p>
          <div
            aria-hidden
            className="absolute left-1/2 top-full -translate-x-1/2 -mt-px border-[5px] border-transparent border-t-[#111111]"
          />
        </div>
      )}
      {remainingFreeChats === null ? (
        <UsageRingLoading />
      ) : (
        <FreeChatUsageRing
          remainingFreeChats={remainingFreeChats}
          totalFreeChats={totalFreeChats}
          reduceMotion={reduceMotion}
        />
      )}
    </div>
  );
}

function ChatModelSelector({ disabled }: { disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [selectedModelId, setSelectedModelId] = useState<string>(AVAILABLE_MODELS[0].id);
  const [placement, setPlacement] = useState<"above" | "below">("above");
  const [menuCoords, setMenuCoords] = useState<{ top: number; left: number } | null>(null);
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
    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openBelow = spaceBelow >= menuHeight && spaceBelow > spaceAbove;

    setPlacement(openBelow ? "below" : "above");
    setMenuCoords({
      left: rect.left,
      top: openBelow ? rect.bottom + 6 : rect.top - menuHeight - 6,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updateMenuPosition();
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
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open, updateMenuPosition]);

  function handleToggle() {
    if (disabled) return;
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const spaceAbove = rect.top;
      const spaceBelow = window.innerHeight - rect.bottom;
      const openBelow = spaceBelow >= MODEL_MENU_ESTIMATED_HEIGHT && spaceBelow > spaceAbove;
      setPlacement(openBelow ? "below" : "above");
      setMenuCoords({
        left: rect.left,
        top: openBelow
          ? rect.bottom + 6
          : rect.top - MODEL_MENU_ESTIMATED_HEIGHT - 6,
      });
    }
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
                aria-label="Chat models"
                initial={{ opacity: 0, y: menuOffsetY }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: menuOffsetY }}
                transition={{ duration: reduceMotion ? 0 : 0.15, ease: "easeOut" }}
                style={{ top: menuCoords.top, left: menuCoords.left }}
                className={[
                  "fixed z-[100] w-max max-w-[196px] rounded-md border border-white/[0.08] bg-[#111111] py-1",
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
                        "flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] transition-colors cursor-pointer",
                        isSelected
                          ? "text-[#cccccc]"
                          : "text-[#888888] hover:bg-white/[0.05] hover:text-[#cccccc]",
                      ].join(" ")}
                    >
                      <span className="min-w-0 flex-1 truncate">{model.label}</span>
                      {isSelected && (
                        <Icon name="Check" size={16} className="shrink-0 text-[#888888]" aria-hidden />
                      )}
                    </button>
                  );
                })}

                <div
                  role="menuitem"
                  aria-disabled="true"
                  className="flex items-center justify-between gap-2 px-3 py-1.5 text-[12px] text-[#555555] opacity-60 cursor-default select-none"
                >
                  <span className="min-w-0 flex-1" aria-hidden />
                  <span className="shrink-0 rounded-full border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-medium text-[#555555]">
                    {COMING_SOON_MODEL_ROW.badge}
                  </span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )
      : null;

  return (
    <div className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Select model"
        disabled={disabled}
        onClick={handleToggle}
        className={[
          TOOLBAR_CHIP,
          "inline-flex",
          TOOLBAR_CHIP_H,
          "shrink-0 items-center gap-0.5 px-1.5 text-[12px] transition-colors",
          disabled
            ? "cursor-not-allowed opacity-50"
            : "cursor-pointer hover:bg-white/[0.09]",
        ].join(" ")}
      >
        <span className="whitespace-nowrap font-semibold text-[#888888]">
          {selectedModel.label}
        </span>
        <Icon
          name="ChevronDown"
          size={16}
          className={[
            "shrink-0 text-[#888888] transition-transform duration-150",
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

export default function ChatPanel({
  adjustments,
  onPatch,
  imageId,
}: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [changesExpanded, setChangesExpanded] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<PendingChange[]>([]);
  const prefersReducedMotion = useReducedMotion();
  const messageDuration = prefersReducedMotion ? 0 : 0.2;
  const messageInitialY = prefersReducedMotion ? 0 : 6;

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

  /** Lifetime free messages left (0–20) and credits after last server sync. */
  const [lifetimeFreeRemaining, setLifetimeFreeRemaining] = useState<number | null>(null);
  const [creditBalance, setCreditBalance] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const refreshChatQuota = useCallback(() => {
    void fetch("/api/credits")
      .then((r) => r.json())
      .then(
        (data: { creditBalance?: number; lifetimeFreeAI?: number }) => {
          if (typeof data.creditBalance !== "number" || typeof data.lifetimeFreeAI !== "number") {
            return;
          }
          setCreditBalance(data.creditBalance);
          setLifetimeFreeRemaining(Math.max(0, FREE_MESSAGE_ALLOWANCE - data.lifetimeFreeAI));
        },
      )
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
  const chatBlocked =
    lifetimeFreeRemaining !== null &&
    creditBalance !== null &&
    lifetimeFreeRemaining === 0 &&
    creditBalance === 0;

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  function applyAiAdjustments(rawPatch: Partial<Record<string, number>>) {
    const patch = normalizeAdjustmentPatch(rawPatch);
    const keys = Object.keys(patch) as AdjustmentKey[];
    if (keys.length === 0) return;

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

    onPatch(patch);
  }

  function handleUndoAllChanges() {
    if (changeSnapshotRef.current) {
      onPatch(changeSnapshotRef.current);
    }
    setPendingChanges([]);
    setChangesExpanded(false);
    changeSnapshotRef.current = null;
  }

  function handleKeepAllChanges() {
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
      const { dataUrl, base64, mediaType } = await fileToBase64(file);
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

  // ── Send message ────────────────────────────────────────────────────────
  async function handleSend() {
    const text = input.trim();
    if (!text || sending || chatBlocked) return;

    const imagePreview = attachedPreview ?? undefined;
    const imageBase64 = attachedBase64 ?? undefined;
    const imageMediaType = attachedMediaType ?? undefined;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      imagePreview,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    clearAttachment();
    setSending(true);

    const assistantId = crypto.randomUUID();
    const assistantPlaceholder: Message = {
      id: assistantId,
      role: "assistant",
      content: "",
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, assistantPlaceholder]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userMessage: text,
          adjustments,
          imageId,
          imageBase64,
          imageMediaType,
        }),
        signal: controller.signal,
      });

      if (res.status === 429) {
        toast("Too many requests. Please slow down.", { icon: "⏱" });
        setMessages((prev) => prev.filter((m) => m.id !== assistantId));
        return;
      }

      if (res.status === 402) {
        toast.custom(
          (t) => (
            <div
              className={`flex items-center gap-3 transition-opacity ${TOAST_SHELL_CLASS} ${t.visible ? "opacity-100" : "opacity-0"}`}
            >
              <span>Insufficient credits.</span>
              <a
                href="/settings"
                className="underline underline-offset-2 font-medium whitespace-nowrap"
                onClick={() => toast.dismiss(t.id)}
              >
                Purchase credits →
              </a>
            </div>
          ),
          { duration: 5000 },
        );
        setMessages((prev) => prev.filter((m) => m.id !== assistantId));
        return;
      }

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

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
              setLifetimeFreeRemaining(event.lifetimeFreeRemaining);
              setCreditBalance(event.creditBalanceAfter);
            } else if (event.type === "text") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: cleanText(m.content + event.text) }
                    : m,
                ),
              );
            } else if (event.type === "adjustments") {
              applyAiAdjustments(event.adjustments);
            }
          }
        }
      } finally {
        void reader.cancel().catch(() => {
          /* already closed / lock released — ignore */
        });
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setMessages((prev) =>
          prev.filter((m) => m.id !== assistantId || m.content.trim() !== ""),
        );
        return;
      }
      console.error("[ChatPanel] send error:", err);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: "Something went wrong. Please try again." }
            : m,
        ),
      );
    } finally {
      abortRef.current = null;
      setSending(false);
      refreshChatQuota();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  const canSend = !!input.trim() && !sending && !chatBlocked;

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div
      className={[
        "flex flex-col shrink-0 h-full min-w-0 overflow-hidden transition-[width] duration-200 ease-out",
        "bg-black/50 backdrop-blur-xl border-l border-white/[0.07]",
        panelCollapsed ? "w-[44px]" : "w-[400px]",
      ].join(" ")}
    >
      {/* Panel header */}
      <div
        className={[
          "flex items-center shrink-0 h-12 border-b border-white/[0.07]",
          panelCollapsed ? "justify-center px-0" : "px-4",
        ].join(" ")}
      >
        {panelCollapsed ? (
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
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              aria-expanded
              aria-label="Collapse chat panel"
              onClick={() => setPanelCollapsed(true)}
              className="shrink-0 text-[#888888] hover:text-white transition-colors cursor-pointer"
            >
              <Icon name="ChevronRight" size={16} aria-hidden={false} aria-label="Collapse chat panel" />
            </button>
            <span className="text-[13px] font-semibold text-white/70 select-none">
              Chat
            </span>
          </div>
        )}
      </div>

      {!panelCollapsed && (
        <div className="flex flex-col flex-1 min-h-0 min-w-0 overflow-hidden">
          {/* Message thread */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto min-h-0 px-6 py-5 flex flex-col gap-3"
          >
            {messages.length === 0 && (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-[14px] text-[#444444] text-center select-none leading-relaxed px-2">
                  Describe the edits you want or ask a question about your photo.
                </p>
              </div>
            )}

            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: messageInitialY }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: messageDuration, ease: "easeOut" }}
                className={`flex flex-col gap-[4px] ${msg.role === "user" ? "items-end" : "items-start"}`}
              >
                {msg.imagePreview && (
                  <div className="mb-1">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={msg.imagePreview}
                      alt="Attached reference"
                      className="max-w-[140px] max-h-[100px] rounded-lg object-cover border border-white/[0.08]"
                    />
                  </div>
                )}

                <div
                  className={`max-w-[320px] leading-relaxed whitespace-pre-wrap break-words ${
                    msg.role === "user"
                      ? USER_CHAT_BUBBLE_CLASS
                      : "rounded-lg px-3 py-2.5 text-[14px] bg-white/[0.05] border border-white/[0.08] text-[#e5e5e5]"
                  }`}
                >
                  {msg.content === "" && msg.role === "assistant" ? (
                    <LoadingSpinner size="xs" variant="muted" label="Assistant is typing" />
                  ) : (
                    msg.content
                  )}
                </div>

                <span className="text-[10px] text-[#444444] px-[2px] select-none">
                  {formatTime(msg.timestamp)}
                </span>
              </motion.div>
            ))}
          </div>

          {/* Changes indicator bar */}
          {pendingChanges.length > 0 && (
            <div
              className={`mx-6 mb-2 shrink-0 overflow-hidden rounded-md border border-white/[0.08] bg-white/[0.04] ${CHAT_SURFACE_SHADOW}`}
            >
              <div className="flex items-center gap-2 px-3 py-2 min-w-0">
                <button
                  type="button"
                  aria-expanded={changesExpanded}
                  aria-label={changesExpanded ? "Collapse changes" : "Expand changes"}
                  onClick={() => setChangesExpanded((prev) => !prev)}
                  className="shrink-0 text-[#888888] hover:text-white transition-colors cursor-pointer"
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
                </button>

                <span className="min-w-0 truncate text-[13px] font-medium text-[#888888]">
                  {pendingChanges.length} Change{pendingChanges.length !== 1 ? "s" : ""}
                </span>

                <div className="ml-auto flex shrink-0 items-center gap-2">
                  <button type="button" onClick={handleUndoAllChanges} className={BTN_SECONDARY}>
                    Undo all
                  </button>
                  <button
                    type="button"
                    onClick={handleKeepAllChanges}
                    className={`${BTN_PRIMARY_SOLID} !h-8 !px-3.5 !text-[12px] !font-semibold !rounded-md`}
                  >
                    Keep all
                  </button>
                </div>
              </div>

              {changesExpanded && (
                <div className="border-t border-white/[0.06] px-3 py-2 space-y-1.5">
                  {pendingChanges.map((change) => (
                    <div
                      key={change.key}
                      className="text-[12px] font-medium text-[#888888] leading-snug"
                    >
                      {change.label}: {change.from} → {change.to}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Input composite — pinned to bottom */}
          <div className="shrink-0 px-6 pb-4 pt-2">
            {attachedPreview && (
              <div className="pb-2">
                <div className="relative inline-block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={attachedPreview}
                    alt="Attached"
                    className="h-[56px] w-auto max-w-[120px] rounded-lg object-cover border border-white/[0.08]"
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
                  <p className="text-[10px] text-[#555555] mt-[3px] truncate max-w-[200px]">
                    {attachedFile.name}
                  </p>
                )}
              </div>
            )}

            {chatBlocked && (
              <p className="pb-2 text-[12px] text-[#666666] leading-snug">
                Free messages used.{" "}
                <a
                  href="/settings"
                  className="text-[#a3a3a3] underline underline-offset-2 hover:text-white"
                >
                  Purchase credits
                </a>{" "}
                to continue chatting.
              </p>
            )}

            <div
              className={`overflow-hidden rounded-xl border border-white/[0.08] bg-[#111111] ${CHAT_SURFACE_SHADOW}`}
            >
              {/* Upper input field */}
              <div className="flex min-h-[76px] items-start px-4 pt-3 pb-3">
                <div className="flex w-full items-center gap-3.5">
                  <Image
                    src="/r-logo.png"
                    alt=""
                    width={42}
                    height={42}
                    className="shrink-0 rounded"
                    aria-hidden
                  />
                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={
                      chatBlocked
                        ? "Purchase credits to continue chatting…"
                        : "Describe the edit you want..."
                    }
                    rows={1}
                    disabled={chatBlocked}
                    className="w-full resize-none bg-transparent pt-0 text-[15px] font-normal text-white placeholder:text-[#666666] placeholder:font-normal outline-none leading-snug min-h-[24px] max-h-[80px] overflow-y-auto disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ fieldSizing: "content" } as React.CSSProperties}
                  />
                </div>
              </div>

              {/* Lower toolbar row */}
              <div className="flex items-center justify-between gap-2 border-t border-white/[0.06] px-4 pb-3 pt-3">
                <div className="flex min-w-0 items-center gap-1.5 shrink-0">
                  <div className={`${TOOLBAR_CHIP} flex ${TOOLBAR_CHIP_H} w-8 items-center justify-center`}>
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

                  <ChatModelSelector disabled={chatBlocked} />

                  <UsageRingWithTooltip
                    remainingFreeChats={lifetimeFreeRemaining}
                    totalFreeChats={FREE_MESSAGE_ALLOWANCE}
                    reduceMotion={!!prefersReducedMotion}
                  />
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
                          ? `${BTN_PRIMARY_ICON} !h-8 !w-8 !rounded-md`
                          : "shrink-0 flex items-center justify-center w-8 h-8 rounded-md bg-white/[0.08] text-[#666666] opacity-50 cursor-not-allowed",
                      ].join(" ")}
                    >
                      <Icon name="Send01" size={16} aria-hidden />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
