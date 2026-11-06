"use client";

import { usePopupMotion } from "@/lib/popup-motion";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Icon } from "@/components/shared/Icon";
import type { AlbumRecord } from "@/types/album";

interface AlbumOptionsMenuProps {
  album: AlbumRecord;
  onRequestRename: (album: AlbumRecord) => void;
  onRequestDelete: (album: AlbumRecord) => void;
  alwaysVisible?: boolean;
  className?: string;
}

export default function AlbumOptionsMenu({
  album,
  onRequestRename,
  onRequestDelete,
  alwaysVisible = false,
  className,
}: AlbumOptionsMenuProps) {
  const popupMotion = usePopupMotion();
  const [menuOpen, setMenuOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;

    function handleOutside(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }

    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }

    document.addEventListener("pointerdown", handleOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", handleOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [menuOpen]);

  return (
    <div ref={rootRef} className={className}>
      <button
        type="button"
        aria-label={`Options for ${album.name}`}
        aria-expanded={menuOpen}
        onClick={(e) => {
          e.stopPropagation();
          setMenuOpen((prev) => !prev);
        }}
        className={[
          "flex items-center justify-center rounded-md transition-opacity cursor-pointer focus-visible:ring-1 focus-visible:ring-white/40",
          alwaysVisible ? "h-11 w-11 text-white" : "h-full w-7",
          alwaysVisible || menuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
        ].join(" ")}
      >
        <Icon name="DotsHorizontal" size={16} aria-hidden />
      </button>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            key={`album-menu-${album.id}`}
            {...popupMotion}
            className="absolute right-0 top-[calc(100%+4px)] z-30 min-w-[160px] rounded-lg border border-[#212121] bg-[#121212] p-1 shadow-2xl"
          >
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onRequestRename(album);
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-white/80 transition-colors cursor-pointer hover:bg-[#1d1d1d]"
            >
              <Icon name="Edit01" size={16} className="shrink-0" aria-hidden />
              Rename album
            </button>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onRequestDelete(album);
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-[#ef4444] transition-colors cursor-pointer hover:bg-[#1d1d1d]"
            >
              <Icon name="Trash04" size={16} className="shrink-0" aria-hidden />
              Delete album
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
