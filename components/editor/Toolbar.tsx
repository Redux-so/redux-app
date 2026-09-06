"use client";

import { BTN_BRAND_SOLID } from "@/lib/button-styles";
import BackToLibraryButton from "@/components/shared/BackToLibraryButton";
import { Icon } from "@/components/shared/Icon";
import { SURFACE_BTN_ACTIVE, SURFACE_BTN_IDLE } from "@/lib/surface-colors";

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
}

function ToolbarBtn({
  onClick,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={[
        "flex shrink-0 items-center justify-center h-9 w-9 rounded-md transition-colors cursor-pointer",
        "disabled:opacity-30 disabled:cursor-not-allowed",
        "text-white/40 hover:bg-[#1d1d1d] hover:text-white",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="w-px h-5 bg-white/[0.08] mx-1" />;
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
}: ToolbarProps) {
  const zoomPercent = `${Math.round(zoom * 100)}%`;

  return (
    <div className="grid h-16 shrink-0 grid-cols-[1fr_auto_1fr] items-center border-b border-[#212121] bg-[#121212] pl-3 pr-3">
      {/* Left — back to library */}
      <div className="flex min-w-0 shrink-0 items-center justify-self-start gap-3">
        <BackToLibraryButton />
      </div>

      {/* Center — canvas controls (true viewport center via symmetric 1fr columns) */}
      <div className="flex shrink-0 items-center justify-center gap-[2px]">
        {/* Zoom */}
        <ToolbarBtn onClick={zoomOut} title="Zoom out">
          <Icon name="Minus" size={20} aria-hidden />
        </ToolbarBtn>

        <button
          onClick={resetZoom}
          title="Reset zoom"
          className="flex shrink-0 items-center justify-center h-9 px-3 rounded-md text-[14px] text-white tabular-nums hover:bg-[#1d1d1d] transition-colors cursor-pointer"
        >
          {zoomPercent}
        </button>

        <ToolbarBtn onClick={zoomIn} title="Zoom in">
          <Icon name="Plus" size={20} aria-hidden />
        </ToolbarBtn>

        <Divider />

        {/* Before / After — matches tool rail icon hover/active */}
        <button
          type="button"
          onClick={toggleBefore}
          title={showBefore ? "Show after" : "Show before"}
          aria-pressed={showBefore}
          className={[
            "flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-md border transition-colors",
            showBefore
              ? `${SURFACE_BTN_ACTIVE} !text-white`
              : SURFACE_BTN_IDLE,
          ].join(" ")}
        >
          <Icon name="Columns02" size={20} aria-hidden />
        </button>

        <Divider />

        {/* Undo / Redo */}
        <ToolbarBtn onClick={onUndo} disabled={!canUndo} title="Undo">
          <Icon name="FlipBackward" size={20} aria-hidden />
        </ToolbarBtn>
        <ToolbarBtn onClick={onRedo} disabled={!canRedo} title="Redo">
          <Icon name="FlipForward" size={20} aria-hidden />
        </ToolbarBtn>
      </div>

      {/* Right — file info + actions */}
      <div className="flex min-w-0 w-full max-w-full items-center justify-end gap-6 pl-3">
        {filename && (
          <span
            title={filename}
            className="min-w-0 max-w-[22ch] shrink truncate text-left text-[13px] text-[#888888]"
          >
            {filename}
          </span>
        )}

        <div className="flex shrink-0 items-center gap-[5px]">
          <span
            className={[
              "w-2 h-2 rounded-full shrink-0 transition-colors",
              isDirty ? "bg-[#f59e0b]" : "bg-[#22c55e]",
              justSaved ? "animate-pulse" : "",
            ].join(" ")}
          />
          <span className="text-[13px] text-[#888888] whitespace-nowrap">
            {isDirty ? "Unsaved" : justSaved ? "Saving…" : "Auto-saved"}
          </span>
        </div>

        <button
          onClick={onExport}
          title="Export / share"
          className={`${BTN_BRAND_SOLID} shrink-0`}
        >
          <Icon name="Download01" size={16} strokeWidth={2} aria-hidden />
          Export
        </button>
      </div>
    </div>
  );
}
