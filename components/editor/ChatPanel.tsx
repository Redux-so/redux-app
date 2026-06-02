"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, MessageCircle, ChevronLeft, ChevronRight, Paperclip, X } from "lucide-react";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import toast from "react-hot-toast";
import type { Adjustments } from "@/hooks/useEditor";
import type { AdjustmentKey } from "@/constants/adjustments";
import { BTN_PRIMARY_ICON } from "@/lib/button-styles";

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

type SseEvent =
  | { type: "meta"; lifetimeFreeRemaining: number; creditBalanceAfter: number }
  | { type: "text"; text: string }
  | { type: "adjustments"; adjustments: Partial<Record<AdjustmentKey, number>> }
  | { type: "done" };

interface ChatPanelProps {
  adjustments: Adjustments;
  onPatch: (patch: Partial<Adjustments>) => void;
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
export default function ChatPanel({
  adjustments,
  onPatch,
  imageId,
}: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [panelCollapsed, setPanelCollapsed] = useState(false);

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
          setLifetimeFreeRemaining(Math.max(0, 20 - data.lifetimeFreeAI));
        },
      )
      .catch(() => {});
  }, []);

  // Load quota before first message; refresh when user returns (e.g. after buying credits)
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

  // ── Send message ────────────────────────────────────────────────────────
  async function handleSend() {
    const text = input.trim();
    if (!text || sending || chatBlocked) return;

    const imagePreview = attachedPreview ?? undefined;
    const imageBase64 = attachedBase64 ?? undefined;
    const imageMediaType = attachedMediaType ?? undefined;

    // Add user message to thread
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

    // Optimistic assistant placeholder
    const assistantId = crypto.randomUUID();
    const assistantPlaceholder: Message = {
      id: assistantId,
      role: "assistant",
      content: "",
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, assistantPlaceholder]);

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
              className={`flex items-center gap-3 px-4 py-3 rounded-lg border border-white/[0.08] bg-white/[0.05] backdrop-blur-xl text-[#e5e5e5] text-[13px] shadow-lg transition-opacity ${t.visible ? "opacity-100" : "opacity-0"}`}
            >
              <span>Insufficient credits.</span>
              <a
                href="/settings"
                className="text-white underline underline-offset-2 font-medium whitespace-nowrap"
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

      let rawBuffer = ""; // accumulates partial SSE lines

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          rawBuffer += decoder.decode(value, { stream: true });

          // Process complete SSE lines (each ends with \n\n)
          const lines = rawBuffer.split("\n\n");
          rawBuffer = lines.pop() ?? ""; // keep the incomplete last chunk

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const jsonStr = line.slice(6); // strip "data: "
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
              onPatch(event.adjustments as Partial<Adjustments>);
            }
            // "done" — nothing extra needed, the outer loop will finish
          }
        }
      } finally {
        void reader.cancel().catch(() => {
          /* already closed / lock released — ignore */
        });
      }
    } catch (err) {
      console.error("[ChatPanel] send error:", err);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: "Something went wrong. Please try again." }
            : m,
        ),
      );
    } finally {
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
          "flex items-center shrink-0 h-[52px] border-b border-white/[0.07] gap-2",
          panelCollapsed ? "justify-center px-0" : "px-6",
        ].join(" ")}
      >
        <button
          type="button"
          aria-expanded={!panelCollapsed}
          aria-label={panelCollapsed ? "Expand chat panel" : "Collapse chat panel"}
          onClick={() => setPanelCollapsed((prev) => !prev)}
          className="shrink-0 text-[#555555] hover:text-[#888888] transition-colors cursor-pointer"
        >
          {panelCollapsed ? (
            <ChevronLeft size={14} strokeWidth={2} />
          ) : (
            <ChevronRight size={14} strokeWidth={2} />
          )}
        </button>
        {!panelCollapsed && (
          <div className="flex items-center gap-2 min-w-0">
            <MessageCircle size={14} strokeWidth={1.75} className="text-[#888888] shrink-0" />
            <span className="text-[14px] font-medium uppercase tracking-widest text-[#888888] select-none truncate">
              Chat
            </span>
          </div>
        )}
      </div>

      <div
        className={[
          "flex flex-col flex-1 min-h-0 min-w-0 overflow-hidden",
          panelCollapsed ? "hidden" : "flex",
        ].join(" ")}
      >
        {/* Message thread */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto min-h-0 px-6 py-5 flex flex-col gap-3"
        >
        {/* Empty state */}
        {messages.length === 0 && (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-[14px] text-[#444444] text-center select-none leading-relaxed px-2">
              Describe the edits you want or ask a question about your photo.
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col gap-[4px] ${msg.role === "user" ? "items-end" : "items-start"}`}
          >
            {/* Image thumbnail (user messages only) */}
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

            {/* Bubble */}
            <div
              className={`max-w-[320px] rounded-lg px-3 py-2.5 text-[14px] leading-relaxed whitespace-pre-wrap break-words ${
                msg.role === "user"
                  ? "bg-white text-black"
                  : "bg-white/[0.05] border border-white/[0.08] text-[#e5e5e5]"
              }`}
            >
              {/* Loading dots when assistant placeholder is empty */}
              {msg.content === "" && msg.role === "assistant" ? (
                <LoadingSpinner size="xs" variant="muted" label="Assistant is typing" />
              ) : (
                msg.content
              )}
            </div>

            {/* Timestamp */}
            <span className="text-[10px] text-[#444444] px-[2px] select-none">
              {formatTime(msg.timestamp)}
            </span>
          </div>
        ))}
      </div>

      {/* Image thumbnail preview above input */}
      {attachedPreview && (
        <div className="px-6 pb-2">
          <div className="relative inline-block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={attachedPreview}
              alt="Attached"
              className="h-[56px] w-auto max-w-[120px] rounded-lg object-cover border border-white/[0.08]"
            />
            <button
              onClick={clearAttachment}
              className="absolute -top-[6px] -right-[6px] w-[16px] h-[16px] rounded-full bg-white/[0.12] border border-white/[0.2] flex items-center justify-center text-white/70 hover:text-white hover:bg-white/[0.2] transition-colors"
            >
              <X size={9} strokeWidth={2.5} />
            </button>
          </div>
          {attachedFile && (
            <p className="text-[10px] text-[#555555] mt-[3px] truncate max-w-[200px]">
              {attachedFile.name}
            </p>
          )}
        </div>
      )}

      {/* Lifetime free tier + exhausted state */}
      {lifetimeFreeRemaining !== null && creditBalance !== null && (
        <div className="px-6 pb-1 space-y-0.5">
          {lifetimeFreeRemaining > 0 ? (
            <p className="text-[12px] text-[#444444]">
              {lifetimeFreeRemaining} of 20 free message{lifetimeFreeRemaining !== 1 ? "s" : ""}{" "}
              remaining
            </p>
          ) : creditBalance === 0 ? (
            <p className="text-[12px] text-[#666666] leading-snug">
              Free messages used.{" "}
              <a
                href="/settings"
                className="text-[#a3a3a3] underline underline-offset-2 hover:text-white"
              >
                Purchase credits
              </a>{" "}
              to continue chatting.
            </p>
          ) : null}
        </div>
      )}

      {/* Input area */}
      <div className="px-6 pb-6 pt-3 shrink-0">
        <div className="flex flex-col gap-2 rounded-lg border border-white/[0.06] bg-[#111111] px-4 py-3">
          {/* Textarea — full width above attach/send controls */}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              chatBlocked
                ? "Purchase credits to continue chatting…"
                : "Describe the edits you want or ask for help..."
            }
            rows={1}
            disabled={chatBlocked}
            className="w-full resize-none bg-transparent text-[14px] text-white placeholder:text-[#555555] outline-none leading-relaxed min-h-[20px] max-h-[80px] overflow-y-auto disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ fieldSizing: "content" } as React.CSSProperties}
          />

          <div className="flex items-center justify-between">
            {/* Paperclip */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="Attach reference image"
              disabled={chatBlocked}
              className="shrink-0 text-[#555555] hover:text-[#888888] transition-colors disabled:opacity-40 disabled:pointer-events-none"
            >
              <Paperclip size={16} strokeWidth={1.5} />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => { void handleFileChange(e); }}
            />

            {/* Send */}
            <button
              type="button"
              onClick={() => { void handleSend(); }}
              disabled={!canSend}
              title="Send"
              className={[
                canSend
                  ? BTN_PRIMARY_ICON
                  : "shrink-0 flex items-center justify-center w-8 h-8 rounded-xl bg-white/[0.08] text-[#555555] opacity-50 cursor-not-allowed",
              ].join(" ")}
            >
              <ArrowUp size={14} strokeWidth={2.5} />
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
  );
}
