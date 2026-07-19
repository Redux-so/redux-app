"use client";

import Link from "next/link";
import { useState } from "react";

import AppChromeLogo from "@/components/shared/AppChromeLogo";
import { Icon } from "@/components/shared/Icon";
import ProfileMenu from "@/components/shared/ProfileMenu";
import CreateAlbumModal from "@/components/library/CreateAlbumModal";
import {
  DEFAULT_LIBRARY_SIDEBAR_VIEW,
  LIBRARY_QUICK_FILTER_OPTIONS,
} from "@/constants/library-quick-filters";
import {
  LIBRARY_SIDEBAR_FOOTER_PADDING_X_PX,
  LIBRARY_SIDEBAR_WIDTH_PX,
} from "@/constants/library-sidebar";
import type { LibrarySidebarView } from "@/lib/library-filters";
import type { AlbumRecord } from "@/types/album";

const SECTION_LABEL =
  "text-xs font-semibold uppercase tracking-wide text-[#888888]";

interface LibrarySidebarProps {
  sidebarView: LibrarySidebarView;
  onSidebarViewChange: (view: LibrarySidebarView) => void;
  albums: AlbumRecord[];
  onCreateAlbum: (name: string) => Promise<boolean>;
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
}: LibrarySidebarProps) {
  const [createModalOpen, setCreateModalOpen] = useState(false);

  function handleAlbumClick(albumId: string) {
    if (sidebarView.kind === "album" && sidebarView.albumId === albumId) {
      onSidebarViewChange(DEFAULT_LIBRARY_SIDEBAR_VIEW);
      return;
    }
    onSidebarViewChange({ kind: "album", albumId });
  }

  return (
    <>
      <aside
        className="flex flex-col shrink-0 h-full bg-[#040404] rounded-r-2xl border-r border-white/[0.06] overflow-hidden"
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
                    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium transition-colors cursor-pointer outline-none focus:outline-none",
                    isActive
                      ? "bg-white/[0.08] text-white"
                      : "text-[#888888] hover:bg-white/[0.06] hover:text-white",
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

        <div className="flex-1 min-h-0 overflow-y-auto mt-4 pb-4">
          <div className="px-5 mb-3 flex items-center justify-between gap-2">
            <p className={SECTION_LABEL}>Albums</p>
            <button
              type="button"
              aria-label="Create album"
              onClick={() => setCreateModalOpen(true)}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[#888888] transition-colors hover:bg-white/[0.06] hover:text-white cursor-pointer outline-none focus:outline-none"
            >
              <Icon name="Plus" size={16} aria-hidden />
            </button>
          </div>

          {albums.length === 0 ? (
            <p className="px-5 text-[12px] text-[#555555]">No albums yet</p>
          ) : (
            <nav aria-label="Albums" className="flex flex-col gap-0.5 px-3">
              {albums.map((album) => {
                const isActive =
                  sidebarView.kind === "album" && sidebarView.albumId === album.id;
                return (
                  <button
                    key={album.id}
                    type="button"
                    aria-current={isActive ? "page" : undefined}
                    onClick={() => handleAlbumClick(album.id)}
                    className={[
                      "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium transition-colors cursor-pointer outline-none focus:outline-none",
                      isActive
                        ? "bg-white/[0.08] text-white"
                        : "text-[#888888] hover:bg-white/[0.06] hover:text-white",
                    ].join(" ")}
                  >
                    <Icon
                      name="Folder"
                      size={16}
                      className={[
                        "shrink-0",
                        isActive ? "text-white" : "text-[#888888]",
                      ].join(" ")}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate">{album.name}</span>
                  </button>
                );
              })}
            </nav>
          )}
        </div>

        <div className="shrink-0 px-4 py-4 border-t border-white/[0.06]">
          <ProfileMenu
            className="w-full"
            popoverPanelWidthPx={LIBRARY_SIDEBAR_WIDTH_PX}
            popoverInsetLeftPx={-LIBRARY_SIDEBAR_FOOTER_PADDING_X_PX}
          />
        </div>
      </aside>

      <CreateAlbumModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onCreate={onCreateAlbum}
      />
    </>
  );
}
