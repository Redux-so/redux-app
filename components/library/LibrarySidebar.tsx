"use client";

import Link from "next/link";

import AppChromeLogo from "@/components/shared/AppChromeLogo";
import ProfileMenu from "@/components/shared/ProfileMenu";
import {
  LIBRARY_SIDEBAR_FOOTER_PADDING_X_PX,
  LIBRARY_SIDEBAR_WIDTH_PX,
} from "@/constants/library-sidebar";

/**
 * Left-side panel for the Library page. Logo lives at the top (unchanged from its
 * previous header placement) and the profile menu is pinned to the bottom. Middle
 * section is intentionally empty for now — quick filters and nav items land here later.
 */
export default function LibrarySidebar() {
  return (
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
        <p className="px-5 mt-3 mb-5 text-xs font-semibold uppercase tracking-wide text-[#888888]">
          Library
        </p>
      </div>

      <div className="flex-1 min-h-0" />

      <div className="shrink-0 px-4 py-4 border-t border-white/[0.06]">
        <ProfileMenu
          className="w-full"
          popoverPanelWidthPx={LIBRARY_SIDEBAR_WIDTH_PX}
          popoverInsetLeftPx={-LIBRARY_SIDEBAR_FOOTER_PADDING_X_PX}
        />
      </div>
    </aside>
  );
}
