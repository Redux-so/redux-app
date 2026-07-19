"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Icon } from "@/components/shared/Icon";
import type { AlbumRecord } from "@/types/album";
import toast from "react-hot-toast";

interface PhotoCardAlbumMenuProps {
  imageId: string;
  albums: AlbumRecord[];
  memberAlbumIds: Set<string>;
  onAddedToAlbum: (albumId: string, imageId: string) => void;
}

export default function PhotoCardAlbumMenu({
  imageId,
  albums,
  memberAlbumIds,
  onAddedToAlbum,
}: PhotoCardAlbumMenuProps) {
  const [open, setOpen] = useState(false);
  const [addingAlbumId, setAddingAlbumId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handleOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }

    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  async function handleAddToAlbum(albumId: string) {
    if (memberAlbumIds.has(albumId) || addingAlbumId) return;

    setAddingAlbumId(albumId);
    try {
      const res = await fetch(`/api/albums/${albumId}/images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageId }),
      });

      if (!res.ok) {
        toast.error("Could not add photo to album.");
        return;
      }

      onAddedToAlbum(albumId, imageId);
      toast.success("Added to album");
      setOpen(false);
    } catch {
      toast.error("Could not add photo to album.");
    } finally {
      setAddingAlbumId(null);
    }
  }

  return (
    <div ref={rootRef} className="absolute top-2 left-2 z-10">
      <button
        type="button"
        aria-label="Photo options"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
        className={[
          "pointer-events-auto flex h-8 w-8 items-center justify-center rounded-md border border-white/[0.12] bg-black/40 text-[#888888] backdrop-blur-sm transition-all cursor-pointer",
          open
            ? "opacity-100 text-white"
            : "opacity-0 hover:text-white group-hover:opacity-100",
        ].join(" ")}
      >
        <Icon name="DotsHorizontal" size={16} aria-hidden />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            key="photo-card-album-menu"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute left-0 top-[calc(100%+6px)] z-20 min-w-[180px] rounded-lg border border-white/[0.1] bg-[#141414] p-2 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-[#888888]">
              Add to album
            </p>
            {albums.length === 0 ? (
              <p className="px-2 py-2 text-[12px] text-[#555555]">No albums yet</p>
            ) : (
              <ul className="max-h-[180px] overflow-y-auto">
                {albums.map((album) => {
                  const isMember = memberAlbumIds.has(album.id);
                  const isAdding = addingAlbumId === album.id;
                  return (
                    <li key={album.id}>
                      <button
                        type="button"
                        disabled={isMember || isAdding}
                        onClick={() => void handleAddToAlbum(album.id)}
                        className={[
                          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors",
                          isMember
                            ? "cursor-default text-[#555555]"
                            : "cursor-pointer text-[#cccccc] hover:bg-white/[0.06] hover:text-white disabled:opacity-50",
                        ].join(" ")}
                      >
                        <Icon
                          name="Folder"
                          size={16}
                          className="shrink-0 text-[#888888]"
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1 truncate">{album.name}</span>
                        {isMember && (
                          <Icon
                            name="Check"
                            size={16}
                            className="shrink-0 text-[#888888]"
                            aria-hidden
                          />
                        )}
                        {isAdding && (
                          <span className="text-[11px] text-[#888888]">Adding...</span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
