"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Image from "next/image";
import { Icon } from "@/components/shared/Icon";
import EmptyState from "@/components/shared/EmptyState";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import toast from "react-hot-toast";
import type { Adjustments } from "@/hooks/useEditor";
import type { AdjustmentKey } from "@/constants/adjustments";
import { normalizeAdjustmentPatch } from "@/constants/adjustments";
import { BTN_PRIMARY_ICON, BTN_PRIMARY_SOLID } from "@/lib/button-styles";
import { PANEL_HEADER, PANEL_TITLE } from "@/lib/panel-chrome";
import { TOAST_SHELL_CLASS } from "@/lib/toast-styles";
import { ChatMarkdown } from "@/lib/chat-markdown";
import CreditShopModal from "@/components/shared/CreditShopModal";
import UsageRing from "@/components/shared/UsageRing";
import { USAGE_RING_CONFIG } from "@/constants/usage-ring";
import {
  isChatQuotaBlocked,
  quotaFromApi,
  type UsageQuotaSnapshot,
} from "@/lib/usage-ring-state";

const USER_CHAT_BUBBLE_CLASS =
  "rounded-xl border border-white/[0.08] bg-[#1e0d3a] text-[13px] font-medium text-white py-2.5 px-4";

const BTN_SECONDARY =
  "inline-flex items-center justify-center h-8 px-3.5 rounded-md border border-[#2e2e2e] bg-[#1d1d1d] text-[12px] font-semibold text-white/90 hover:border-[#3a3a3a] transition-colors cursor-pointer select-none disabled:opacity-40 disabled:cursor-not-allowed";

const AVAILABLE_MODELS = [
  { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5" },
] as const;

const COMING_SOON_MODEL_ROW = {
  id: "coming-soon",
  badge: "More coming soon",
} as const;

const MODEL_MENU_ESTIMATED_HEIGHT = 72;

/** Reference-matched surfaces — Redux dark palette, Adam proportions/weight. */
const CHAT_SURFACE_SHADOW =
  "shadow-[0_1px_3px_rgba(0,0,0,0.32),0_2px_8px_rgba(0,0,0,0.14)]";
const TOOLBAR_CHIP_H = "h-8";
const TOOLBAR_CHIP =
  "rounded-md border border-[#2e2e2e] bg-[#1d1d1d] shadow-[0_1px_2px_rgba(0,0,0,0.26),0_2px_5px_rgba(0,0,0,0.12)]";
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
  | {
      type: "meta";
      lifetimeFreeRemaining: number;
      lifetimeFreeUsed: number;
      creditBalanceAfter: number;
    }
  | { type: "text"; text: string }
  | { type: "adjustments"; adjustments: Partial<Record<AdjustmentKey, number>> }
  | { type: "done" };

interface ChatPanelProps {
  adjustments: Adjustments;
  onPatch: (patch: Partial<Record<string, number>>) => void;
  imageId?: string;
  /** Current canvas photo — sent to the model as already-available context. */
  canvasImageUrl?: string | null;
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

function ChatModelSelector({ disabled }: { disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [selectedModelId, setSelectedModelId] = useState<string>(AVAILABLE_MODELS[0].id);
  const [placement, setPlacement] = useState<"above" | "below">("above");
  const [menuCoords, setMenuCoords] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
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
      width: rect.width,
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
        width: rect.width,
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
                style={{
                  top: menuCoords.top,
                  left: menuCoords.left,
                  width: menuCoords.width,
                }}
                className={[
                  "fixed z-[100] rounded-md border border-white/[0.08] bg-[#121212] py-1",
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
                        "flex w-full min-w-0 items-center gap-2 px-3 py-1.5 text-left text-[12px] transition-colors cursor-pointer",
                        isSelected
                          ? "text-[#cccccc]"
                          : "text-[#888888] hover:bg-white/[0.05] hover:text-[#cccccc]",
                      ].join(" ")}
                    >
                      <span className="min-w-0 flex-1 truncate text-[10px] leading-snug">
                        {model.label}
                      </span>
                      {isSelected && (
                        <Icon
                          name="Check"
                          size={16}
                          className="shrink-0 text-[#888888]"
                          aria-hidden
                        />
                      )}
                    </button>
                  );
                })}

                <div
                  role="menuitem"
                  aria-disabled="true"
                  className="flex items-center justify-end gap-2 px-3 py-1.5 text-[12px] text-[#555555] opacity-60 cursor-default select-none"
                >
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
            : "cursor-pointer hover:border-[#3a3a3a]",
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
  canvasImageUrl,
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

  /** Chat quota synced from GET /api/credits and live SSE meta events. */
  const [chatQuota, setChatQuota] = useState<UsageQuotaSnapshot | null>(null);
  const [creditShopOpen, setCreditShopOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
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

  function promptPurchaseCredits() {
    openCreditShop();
    toast.custom(
      (t) => (
        <div
          className={`flex items-center gap-3 transition-opacity ${TOAST_SHELL_CLASS} ${t.visible ? "opacity-100" : "opacity-0"}`}
        >
          <span>Purchase credits to continue chatting.</span>
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
  async function handleSend() {
    const text = input.trim();
    if (!text || sending) return;
    if (chatBlocked) {
      promptPurchaseCredits();
      return;
    }

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
          workspaceImageUrl: canvasImageUrl ?? undefined,
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
        promptPurchaseCredits();
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
              setChatQuota((prev) => ({
                lifetimeFreeUsed: event.lifetimeFreeUsed,
                creditBalance: event.creditBalanceAfter,
                totalPurchasedCredits: prev?.totalPurchasedCredits ?? 0,
                hasPurchasedCredits: prev?.hasPurchasedCredits ?? false,
              }));
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
        "bg-[#121212] border-l border-[#2e2e2e] rounded-l-2xl",
        panelCollapsed ? "w-[44px]" : "w-[360px]",
      ].join(" ")}
    >
      {/* Panel header */}
      <div
        className={[
          PANEL_HEADER,
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
            <span className={PANEL_TITLE}>Chat</span>
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
              <div className="flex flex-1 items-center justify-center">
                <EmptyState
                  className="px-2"
                  icon="MessageChatCircle"
                  message="Describe the edits you want or ask a question about your photo."
                />
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
                      : "rounded-lg px-3 py-2.5 text-[14px] bg-[#1d1d1d] border border-[#2e2e2e] text-[#e5e5e5]"
                  }`}
                >
                  {msg.content === "" && msg.role === "assistant" ? (
                    <LoadingSpinner size="xs" variant="muted" label="Assistant is typing" />
                  ) : msg.role === "assistant" ? (
                    <ChatMarkdown content={msg.content} />
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
              className={`overflow-hidden rounded-xl border border-[#2e2e2e] bg-[#1d1d1d] transition-colors focus-within:border-[#3a3a3a] ${CHAT_SURFACE_SHADOW}`}
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
                        ? chatQuota?.hasPurchasedCredits
                          ? "Purchase more credits to continue chatting…"
                          : "Purchase credits to continue chatting…"
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
              <div className="flex items-center justify-between gap-2 border-t border-[#2e2e2e] px-4 pb-3 pt-3">
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

                  <UsageRing
                    quota={chatQuota}
                    onPurchaseClick={openCreditShop}
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

      <CreditShopModal
        open={creditShopOpen}
        onClose={() => {
          setCreditShopOpen(false);
          refreshChatQuota();
        }}
      />
    </div>
  );
}
