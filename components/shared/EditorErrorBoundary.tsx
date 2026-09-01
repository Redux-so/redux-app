"use client";

import * as Sentry from "@sentry/nextjs";
import type { ReactNode } from "react";
import { BTN_PRIMARY_SOLID } from "@/lib/button-styles";
import { CHAT_PANEL_WIDTH_PX } from "@/constants/chat-panel";

type EditorBoundaryLabel = "canvas" | "chat";

const LABEL_COPY: Record<EditorBoundaryLabel, string> = {
  canvas: "Something went wrong with the canvas.",
  chat: "Something went wrong with the chat.",
};

const FALLBACK_SHELL: Record<EditorBoundaryLabel, string> = {
  canvas:
    "flex flex-1 min-h-0 min-w-0 items-center justify-center border border-white/10 bg-[#161616] p-6",
  chat:
    "flex shrink-0 h-full min-w-0 items-center justify-center border-l border-white/10 bg-[#161616] p-6",
};

interface EditorErrorBoundaryProps {
  label: EditorBoundaryLabel;
  children: ReactNode;
}

export default function EditorErrorBoundary({
  label,
  children,
}: EditorErrorBoundaryProps) {
  return (
    <Sentry.ErrorBoundary
      beforeCapture={(scope) => {
        scope.setTag("component", label);
        scope.setContext("editor", { section: label });
      }}
      fallback={({ resetError }) => (
        <div
          className={FALLBACK_SHELL[label]}
          style={label === "chat" ? { width: CHAT_PANEL_WIDTH_PX } : undefined}
          role="alert"
        >
          <div className="flex max-w-sm flex-col items-center gap-4 text-center">
            <p className="text-sm text-white/70">{LABEL_COPY[label]}</p>
            <button type="button" className={BTN_PRIMARY_SOLID} onClick={resetError}>
              Try again
            </button>
          </div>
        </div>
      )}
    >
      {children}
    </Sentry.ErrorBoundary>
  );
}
