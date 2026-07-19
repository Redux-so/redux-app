"use client";

import Link from "next/link";

import AppChromeLogo from "@/components/shared/AppChromeLogo";
import { Icon } from "@/components/shared/Icon";
import ProfileMenu from "@/components/shared/ProfileMenu";
import { LIBRARY_QUICK_FILTER_OPTIONS } from "@/constants/library-quick-filters";
import {
  LIBRARY_SIDEBAR_FOOTER_PADDING_X_PX,
  LIBRARY_SIDEBAR_WIDTH_PX,
} from "@/constants/library-sidebar";
import type { LibraryQuickFilter } from "@/lib/library-filters";

interface LibrarySidebarProps {
  quickFilter: LibraryQuickFilter;
  onQuickFilterChange: (filter: LibraryQuickFilter) => void;
}

/**
 * Left-side panel for the Library page. Logo lives at the top (unchanged from its
 * previous header placement) and the profile menu is pinned to the bottom.
 */
export default function LibrarySidebar({
  quickFilter,
  onQuickFilterChange,
}: LibrarySidebarProps) {
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
        <p className="px-5 mt-3 mb-3 text-xs font-semibold uppercase tracking-wide text-[#888888]">
          Library
        </p>

        <nav
          aria-label="Library quick filters"
          className="flex flex-col gap-0.5 px-3 pb-4"
        >
          {LIBRARY_QUICK_FILTER_OPTIONS.map((option) => {
            const isActive = quickFilter === option.id;
            return (
              <button
                key={option.id}
                type="button"
                aria-current={isActive ? "page" : undefined}
                onClick={() => onQuickFilterChange(option.id)}
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
