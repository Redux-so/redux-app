"use client";

import { appPath } from "@/lib/app-path";

import { useCallback, useEffect, useRef, useState } from "react";
import { messagesFromTurns, type ChatHistoryPage, type ChatMessage } from "@/lib/chat-history-shared";

/** Transcript hydration only: loading old messages must never execute edit actions. */
export function useImageChatHistory(imageId?: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(!imageId);
  const [historyLoading, setHistoryLoading] = useState(!!imageId);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [beforeCursor, setBeforeCursor] = useState<number | null>(null);
  const requestRef = useRef<AbortController | null>(null);

  const loadHistory = useCallback(async (before?: number) => {
    if (!imageId) return false;
    requestRef.current?.abort();
    const request = new AbortController();
    requestRef.current = request;
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const response = await fetch(appPath(`/api/images/${encodeURIComponent(imageId)}/chat${before ? `?before=${before}` : ""}`), {
        cache: "no-store", signal: request.signal,
      });
      if (!response.ok) throw new Error("Could not load chat history. Please try again.");
      const page = await response.json() as ChatHistoryPage;
      if (request.signal.aborted) return false;
      const restored = messagesFromTurns(page.turns);
      setMessages((current) => {
        if (!before) return restored;
        const ids = new Set(current.map((message) => message.id));
        return [...restored.filter((message) => !ids.has(message.id)), ...current];
      });
      setBeforeCursor(page.beforeCursor);
      setHistoryLoaded(true);
      return true;
    } catch (error) {
      if (!request.signal.aborted) setHistoryError(error instanceof Error ? error.message : "Could not load chat history.");
      return false;
    } finally {
      if (!request.signal.aborted) setHistoryLoading(false);
    }
  }, [imageId]);

  useEffect(() => {
    void loadHistory();
    return () => requestRef.current?.abort();
  }, [loadHistory]);

  return { messages, setMessages, historyLoaded, historyLoading, historyError, beforeCursor, loadHistory };
}
