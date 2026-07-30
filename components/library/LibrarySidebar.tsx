"use client";

import Link from "next/link";
import { useState } from "react";

import AppChromeLogo from "@/components/shared/AppChromeLogo";
import { Icon } from "@/components/shared/Icon";
import DiscordIcon from "@/components/shared/DiscordIcon";
import GitHubIcon from "@/components/shared/GitHubIcon";
import ProfileMenu from "@/components/shared/ProfileMenu";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import AlbumSidebarRow from "@/components/library/AlbumSidebarRow";
import CreateAlbumModal from "@/components/library/CreateAlbumModal";
import {
  DEFAULT_LIBRARY_SIDEBAR_VIEW,
  LIBRARY_QUICK_FILTER_OPTIONS,
} from "@/constants/library-quick-filters";
import {
  LIBRARY_PROFILE_POPOVER_WIDTH_PX,
  LIBRARY_SIDEBAR_BTN_ACTIVE,
  LIBRARY_SIDEBAR_BTN_IDLE,
  LIBRARY_SIDEBAR_BTN_ROW,
  LIBRARY_SIDEBAR_ICON_BTN,
  LIBRARY_SIDEBAR_LINK_ROW,
  LIBRARY_SIDEBAR_WIDTH_PX,
  LIBRARY_PANEL_SURFACE,
} from "@/constants/library-sidebar";
import { REDUX_DOCS_URL, REDUX_HELP_FEEDBACK_URL } from "@/constants/support";
import type { LibrarySidebarView } from "@/lib/library-filters";
import type { AlbumRecord } from "@/types/album";

const SECTION_LABEL =
  "text-xs font-semibold uppercase tracking-wide text-[#888888]";

interface LibrarySidebarProps {
  sidebarView: LibrarySidebarView;
  onSidebarViewChange: (view: LibrarySidebarView) => void;
  albums: AlbumRecord[];
  onCreateAlbum: (name: string) => Promise<boolean>;
  onDeleteAlbum: (albumId: string) => Promise<boolean>;
}

/**
 * Left-side panel for the Library page. Logo lives at the top (unchanged from its
 * previous header placement) and the profile menu is pinned to the bottom.
 */
export default function LibrarySidebar({
  sidebarView,
  onSidebarViewChange,
  albums,
  onCreateAlbum,
  onDeleteAlbum,
}: LibrarySidebarProps) {
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [albumToDelete, setAlbumToDelete] = useState<AlbumRecord | null>(null);
  const [deletingAlbum, setDeletingAlbum] = useState(false);

  function handleAlbumClick(albumId: string) {
    if (sidebarView.kind === "album" && sidebarView.albumId === albumId) {
      onSidebarViewChange(DEFAULT_LIBRARY_SIDEBAR_VIEW);
      return;
    }
    onSidebarViewChange({ kind: "album", albumId });
  }

  async function handleConfirmDeleteAlbum() {
    if (!albumToDelete || deletingAlbum) return;

    setDeletingAlbum(true);
    try {
      const ok = await onDeleteAlbum(albumToDelete.id);
      if (ok) setAlbumToDelete(null);
    } finally {
      setDeletingAlbum(false);
    }
  }

  return (
    <>
      <aside
        className={`flex flex-col shrink-0 h-full rounded-r-2xl border-r overflow-hidden ${LIBRARY_PANEL_SURFACE}`}
        style={{ width: LIBRARY_SIDEBAR_WIDTH_PX }}
      >
        <div className="shrink-0">
          <div className="flex items-center px-5 pt-4 pb-0">
            <Link
              href="/library"
              className="inline-flex items-center no-underline transition-opacity duration-150 hover:opacity-80 focus-visible:opacity-80"
            >
              <AppChromeLogo />
            </Link>
          </div>
          <p className={`px-5 mt-3 mb-3 ${SECTION_LABEL}`}>Library</p>

          <nav
            aria-label="Library quick filters"
            className="flex flex-col gap-0.5 px-3"
          >
            {LIBRARY_QUICK_FILTER_OPTIONS.map((option) => {
              const isActive =
                sidebarView.kind === "quick" && sidebarView.filter === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-current={isActive ? "page" : undefined}
                  onClick={() =>
                    onSidebarViewChange({ kind: "quick", filter: option.id })
                  }
                  className={[
                    LIBRARY_SIDEBAR_BTN_ROW,
                    isActive ? LIBRARY_SIDEBAR_BTN_ACTIVE : LIBRARY_SIDEBAR_BTN_IDLE,
                  ].join(" ")}
                >
                  <Icon
                    name={option.icon}
                    size={16}
                    className={[
                      "shrink-0",
                      isActive ? "text-white" : "text-[#888888]",
                    ].join(" ")}
                    aria-hidden
                  />
                  <span className="min-w-0 truncate">{option.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="flex flex-col flex-1 min-h-0 mt-4">
          <div className="scroll-stable flex-1 min-h-0 overflow-y-auto overscroll-y-contain pb-2">
            <div className="px-5 mb-3 flex items-center justify-between gap-2">
              <p className={SECTION_LABEL}>Albums</p>
              <button
                type="button"
                aria-label="Create album"
                onClick={() => setCreateModalOpen(true)}
                className={`${LIBRARY_SIDEBAR_ICON_BTN} h-6 w-6`}
              >
                <Icon name="Plus" size={16} aria-hidden />
              </button>
            </div>

            {albums.length === 0 ? (
              <p className="px-5 text-[12px] text-[#555555]">No albums yet</p>
            ) : (
              <nav aria-label="Albums" className="flex flex-col gap-0.5 px-3">
                {albums.map((album) => (
                  <AlbumSidebarRow
                    key={album.id}
                    album={album}
                    isActive={
                      sidebarView.kind === "album" &&
                      sidebarView.albumId === album.id
                    }
                    onSelect={() => handleAlbumClick(album.id)}
                    onRequestDelete={setAlbumToDelete}
                  />
                ))}
              </nav>
            )}
          </div>

          <nav aria-label="Trash" className="shrink-0 px-3 pb-2">
            <button
              type="button"
              aria-current={sidebarView.kind === "trash" ? "page" : undefined}
              onClick={() => onSidebarViewChange({ kind: "trash" })}
              className={[
                LIBRARY_SIDEBAR_BTN_ROW,
                sidebarView.kind === "trash"
                  ? LIBRARY_SIDEBAR_BTN_ACTIVE
                  : LIBRARY_SIDEBAR_BTN_IDLE,
              ].join(" ")}
            >
              <Icon
                name="Trash04"
                size={16}
                className={[
                  "shrink-0",
                  sidebarView.kind === "trash" ? "text-white" : "text-[#888888]",
                ].join(" ")}
                aria-hidden
              />
              <span className="min-w-0 truncate">Trash</span>
            </button>
          </nav>
        </div>

        <nav
          aria-label="Resources"
          className="shrink-0 px-3 py-3 flex flex-col gap-0.5"
        >
          <a
            href={REDUX_DOCS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={LIBRARY_SIDEBAR_LINK_ROW}
          >
            <GitHubIcon
              size={16}
              className="text-[#888888] group-hover:text-white"
            />
            <span className="min-w-0 truncate">GitHub</span>
          </a>
          <a
            href={REDUX_HELP_FEEDBACK_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={LIBRARY_SIDEBAR_LINK_ROW}
          >
            <DiscordIcon
              size={16}
              className="text-[#888888] group-hover:text-white"
            />
            <span className="min-w-0 truncate">Discord</span>
          </a>
        </nav>

        <div className="shrink-0 px-4 py-4 border-t border-[#2e2e2e]">
          <ProfileMenu
            variant="full"
            className="w-full"
            popoverPanelWidthPx={LIBRARY_PROFILE_POPOVER_WIDTH_PX}
            popoverCentered
            settingsReturnPath="/library"
          />
        </div>
      </aside>

      <CreateAlbumModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onCreate={onCreateAlbum}
      />

      <ConfirmDialog
        open={albumToDelete !== null}
        title={
          albumToDelete ? `Delete "${albumToDelete.name}"?` : "Delete album?"
        }
        body="This removes the album only. Photos in this album will stay in your library."
        confirmLabel="Delete Album"
        destructive
        loading={deletingAlbum}
        onConfirm={() => void handleConfirmDeleteAlbum()}
        onCancel={() => {
          if (!deletingAlbum) setAlbumToDelete(null);
        }}
      />
    </>
  );
}
