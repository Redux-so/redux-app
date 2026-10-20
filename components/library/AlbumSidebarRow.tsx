"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Icon } from "@/components/shared/Icon";
import {
  LIBRARY_SIDEBAR_BTN_ACTIVE,
  LIBRARY_SIDEBAR_BTN_IDLE,
  LIBRARY_SIDEBAR_BTN_ROW,
} from "@/constants/library-sidebar";
import type { AlbumRecord } from "@/types/album";

interface AlbumSidebarRowProps {
  album: AlbumRecord;
  isActive: boolean;
  onSelect: () => void;
  onRequestRename: (album: AlbumRecord) => void;
  onRequestDelete: (album: AlbumRecord) => void;
}

export default function AlbumSidebarRow({
  album,
  isActive,
  onSelect,
  onRequestRename,
  onRequestDelete,
}: AlbumSidebarRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;

    function handleOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }

    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }

    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [menuOpen]);

  return (
    <div
      ref={rootRef}
      className={[
        "group relative",
        LIBRARY_SIDEBAR_BTN_ROW,
        isActive ? LIBRARY_SIDEBAR_BTN_ACTIVE : LIBRARY_SIDEBAR_BTN_IDLE,
      ].join(" ")}
    >
      <button
        type="button"
        aria-current={isActive ? "page" : undefined}
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center gap-2.5 pr-8 text-left text-[13px] font-medium cursor-pointer outline-none focus:outline-none"
      >
        <Icon
          name="Folder"
          size={16}
          className={[
            "shrink-0",
            isActive ? "text-white" : "text-[#888888] group-hover:text-white",
          ].join(" ")}
          aria-hidden
        />
        <span className="min-w-0 flex-1 truncate">{album.name}</span>
      </button>

      <button
        type="button"
        aria-label={`Options for ${album.name}`}
        aria-expanded={menuOpen}
        onClick={(e) => {
          e.stopPropagation();
          setMenuOpen((prev) => !prev);
        }}
        className={[
          "absolute inset-y-0 right-1 flex w-7 items-center justify-center rounded-md transition-opacity cursor-pointer outline-none focus:outline-none",
          menuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100",
        ].join(" ")}
      >
        <Icon name="DotsHorizontal" size={16} aria-hidden />
      </button>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            key={`album-menu-${album.id}`}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
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
