"use client";

import { usePopupMotion } from "@/lib/popup-motion";

import { LoadingSpinner } from "@/components/shared/LoadingSpinner";

import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useMobileLayout } from "@/hooks/useMobileLayout";
import { AnimatePresence, motion } from "framer-motion";
import { Icon } from "@/components/shared/Icon";
import EmptyState from "@/components/shared/EmptyState";
import { LIBRARY_CHOICE_SELECTED_CLASS } from "@/lib/brand-colors";
import type { AlbumRecord } from "@/types/album";
import toast from "react-hot-toast";

interface PhotoCardAlbumMenuProps {
  imageId: string;
  albums: AlbumRecord[];
  memberAlbumIds: Set<string>;
  onAlbumMembershipChange: (
    albumId: string,
    imageId: string,
    isMember: boolean,
  ) => void;
}

export default function PhotoCardAlbumMenu({
  imageId,
  albums,
  memberAlbumIds,
  onAlbumMembershipChange,
}: PhotoCardAlbumMenuProps) {
  const mobileLayout = useMobileLayout();
  const popupMotion = usePopupMotion();
  const [open, setOpen] = useState(false);
  const [pendingAlbumId, setPendingAlbumId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || mobileLayout) return;

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
  }, [open, mobileLayout]);

  async function handleToggleAlbumMembership(albumId: string) {
    if (pendingAlbumId) return;

    const isMember = memberAlbumIds.has(albumId);
    setPendingAlbumId(albumId);

    try {
      const res = await fetch(`/api/albums/${albumId}/images`, {
        method: isMember ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageId }),
      });

      if (!res.ok) {
        toast.error(
          isMember ? "Could not remove photo from album." : "Could not add photo to album.",
        );
        return;
      }

      onAlbumMembershipChange(albumId, imageId, !isMember);
      toast.success(isMember ? "Removed from album" : "Added to album");
    } catch {
      toast.error(
        isMember ? "Could not remove photo from album." : "Could not add photo to album.",
      );
    } finally {
      setPendingAlbumId(null);
    }
  }

  const albumOptions = (
    <>
      <p className="px-2 py-1 pr-8 text-[11px] font-semibold uppercase tracking-wide text-[#888888]">
        Add to album
      </p>
      {albums.length === 0 ? (
        <EmptyState
          align="start"
          className="px-2 py-2"
          icon="Folder"
          message="No albums yet"
          variant="compact"
        />
      ) : (
        <ul className="max-h-[180px] overflow-y-auto">
          {albums.map((album) => {
            const isMember = memberAlbumIds.has(album.id);
            const isPending = pendingAlbumId === album.id;
            return (
              <li key={album.id}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={isMember}
                  disabled={isPending}
                  onClick={() => void handleToggleAlbumMembership(album.id)}
                  className={[
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors cursor-pointer disabled:cursor-wait disabled:opacity-60",
                    isMember
                      ? "text-white hover:bg-[#1d1d1d]"
                      : "text-[#cccccc] hover:bg-[#1d1d1d] hover:text-white",
                  ].join(" ")}
                >
                  <span
                    className={[
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                      isMember
                        ? `${LIBRARY_CHOICE_SELECTED_CLASS} text-white`
                        : "border-[#2e2e2e] bg-[#1d1d1d] text-transparent",
                    ].join(" ")}
                    aria-hidden
                  >
                    <Icon name="Check" size={16} strokeWidth={2.5} aria-hidden />
                  </span>
                  <Icon
                    name="Folder"
                    size={16}
                    className="shrink-0 text-[#888888]"
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate">{album.name}</span>
                  {isPending && (
                    <LoadingSpinner size="xs" label="Saving album membership" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );

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
          "pointer-events-auto flex h-8 w-8 items-center justify-center rounded-md border border-white/[0.10] bg-black/40 text-[#888888] backdrop-blur-sm transition-all cursor-pointer",
          open
            ? "opacity-100 text-white"
            : "photo-card-album-trigger opacity-0 hover:text-white group-hover:opacity-100",
        ].join(" ")}
      >
        <Icon name="DotsHorizontal" size={16} aria-hidden />
      </button>

      <AnimatePresence>
        {open && !mobileLayout && (
          <motion.div
            key="photo-card-album-menu"
            {...popupMotion}
            className="photo-card-album-menu absolute left-0 top-[calc(100%+6px)] z-20 min-w-[180px] rounded-lg border border-[#212121] bg-[#121212] p-2 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {albumOptions}
          </motion.div>
        )}
      </AnimatePresence>
      {mobileLayout && (
        <Dialog.Root open={open} onOpenChange={setOpen}>
          <Dialog.Portal>
            <Dialog.Overlay className="redux-popup-backdrop fixed inset-0 z-50 bg-black/60" />
            <div className="viewport-modal pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4">
              <Dialog.Content
                aria-describedby={undefined}
                data-photo-card-owner={imageId}
                className="redux-popup-enter pointer-events-auto relative w-full max-w-[360px] rounded-lg border border-[#212121] bg-[#121212] p-3 shadow-2xl outline-none"
                onClick={(event) => event.stopPropagation()}
                onCloseAutoFocus={(event) => {
                  event.preventDefault();
                  rootRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
                }}
              >
                <Dialog.Title className="sr-only">Add photo to album</Dialog.Title>
                <Dialog.Close aria-label="Close album menu" className="absolute right-2 top-2 flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-[#888888] hover:text-white">
                  <Icon name="XClose" size={16} aria-hidden />
                </Dialog.Close>
                {albumOptions}
              </Dialog.Content>
            </div>
          </Dialog.Portal>
        </Dialog.Root>
      )}
    </div>
  );
}
