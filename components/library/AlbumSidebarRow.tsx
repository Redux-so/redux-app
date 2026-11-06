"use client";

import AlbumOptionsMenu from "@/components/library/AlbumOptionsMenu";
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
  return (
    <div
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

      <AlbumOptionsMenu
        album={album}
        onRequestRename={onRequestRename}
        onRequestDelete={onRequestDelete}
        className="absolute inset-y-0 right-1"
      />
    </div>
  );
}
