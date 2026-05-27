"use client";

import Link from "next/link";

import AppChromeLogo from "@/components/shared/AppChromeLogo";
import {
  Minus,
  Plus,
  Columns2,
  Undo2,
  Redo2,
  History,
  Share2,
} from "lucide-react";

interface ToolbarProps {
  filename?: string;
  zoom: number;
  showBefore: boolean;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  toggleBefore: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  isDirty: boolean;
  // true for ~2 s after a successful auto-save — triggers the pulse animation
  justSaved?: boolean;
  onExport: () => void;
  onShowHistory: () => void;
}

function ToolbarBtn({
  onClick,
  disabled,
  active,
  title,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={[
        "flex shrink-0 items-center justify-center w-[32px] h-[32px] rounded-lg transition-colors cursor-pointer",
        "disabled:opacity-30 disabled:cursor-not-allowed",
        active
          ? "bg-[#682FBF]/25 text-[#B07EF0] border border-[#682FBF]/40"
          : "text-white/40 hover:bg-white/[0.07] hover:text-white",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="w-px h-[18px] bg-white/[0.08] mx-1" />;
}

export default function Toolbar({
  filename,
  zoom,
  showBefore,
  zoomIn,
  zoomOut,
  resetZoom,
  toggleBefore,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  isDirty,
  justSaved = false,
  onExport,
  onShowHistory,
}: ToolbarProps) {
  const zoomPercent = `${Math.round(zoom * 100)}%`;

  return (
    <div className="grid h-[52px] shrink-0 grid-cols-[1fr_auto_1fr] items-center border-b border-white/[0.08] bg-black/40 backdrop-blur-2xl pl-3 pr-3">
      {/* Left — logo aligned with library Header (same pl-3 + AppChromeLogo) */}
      <div className="flex min-w-0 shrink-0 items-center justify-self-start gap-3">
        <Link
          href="/library"
          className="inline-flex shrink-0 items-center no-underline transition-opacity duration-150 hover:opacity-80 focus-visible:opacity-80"
        >
          <AppChromeLogo />
        </Link>
      </div>

      {/* Center — canvas controls (true viewport center via symmetric 1fr columns) */}
      <div className="flex shrink-0 items-center justify-center gap-[2px]">
        {/* Zoom */}
        <ToolbarBtn onClick={zoomOut} title="Zoom out">
          <Minus size={16} strokeWidth={2} />
        </ToolbarBtn>

        <button
          onClick={resetZoom}
          title="Reset zoom"
          className="flex shrink-0 items-center justify-center h-[32px] px-3 rounded-lg text-[13px] text-white tabular-nums hover:bg-white/[0.07] transition-colors cursor-pointer"
        >
          {zoomPercent}
        </button>

        <ToolbarBtn onClick={zoomIn} title="Zoom in">
          <Plus size={16} strokeWidth={2} />
        </ToolbarBtn>

        <Divider />

        {/* Before / After */}
        <ToolbarBtn
          onClick={toggleBefore}
          active={showBefore}
          title={showBefore ? "Show after" : "Show before"}
        >
          <Columns2 size={16} strokeWidth={1.75} />
        </ToolbarBtn>

        <Divider />

        {/* Undo / Redo */}
        <ToolbarBtn onClick={onUndo} disabled={!canUndo} title="Undo">
          <Undo2 size={16} strokeWidth={1.75} />
        </ToolbarBtn>
        <ToolbarBtn onClick={onRedo} disabled={!canRedo} title="Redo">
          <Redo2 size={16} strokeWidth={1.75} />
        </ToolbarBtn>
      </div>

      {/* Right — file info + actions */}
      <div className="flex min-w-0 w-full max-w-full items-center justify-end gap-3 pl-3">
        {filename && (
          <span
            title={filename}
            className="min-w-0 max-w-[22ch] shrink truncate text-left text-[12px] text-[#888888]"
          >
            {filename}
          </span>
        )}

        <div className="flex shrink-0 items-center gap-[5px]">
          <span
            className={[
              "w-[6px] h-[6px] rounded-full shrink-0 transition-colors",
              isDirty ? "bg-[#f59e0b]" : "bg-[#22c55e]",
              justSaved ? "animate-pulse" : "",
            ].join(" ")}
          />
          <span className="text-[11px] text-[#888888] whitespace-nowrap">
            {isDirty ? "Unsaved" : justSaved ? "Saving…" : "Auto-saved"}
          </span>
        </div>

        <ToolbarBtn onClick={onShowHistory} title="Version history">
          <History size={16} strokeWidth={1.75} />
        </ToolbarBtn>

        <button
          onClick={onExport}
          title="Export / share"
          className="flex shrink-0 items-center gap-1.5 h-[32px] px-3.5 rounded-full text-[13px] font-medium text-white bg-gradient-to-r from-[#682FBF] to-[#8B44E8] shadow-glow-sm hover:shadow-glow transition-shadow duration-300 cursor-pointer"
        >
          <Share2 size={16} strokeWidth={2} />
          Export
        </button>
      </div>
    </div>
  );
}
