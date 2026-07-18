"use client";

import Link from "next/link";

import AppChromeLogo from "@/components/shared/AppChromeLogo";
import ProfileMenu from "@/components/shared/ProfileMenu";

/**
 * Left-side panel for the Library page. Logo lives at the top (unchanged from its
 * previous header placement) and the profile menu is pinned to the bottom. Middle
 * section is intentionally empty for now — nav/album items land here later.
 */
export default function LibrarySidebar() {
  return (
    <aside className="flex flex-col shrink-0 w-[260px] h-full bg-[#040404] rounded-r-2xl border-r border-white/[0.06] overflow-hidden">
      <div className="flex shrink-0 items-center px-5 py-4">
        <Link
          href="/library"
          className="inline-flex items-center no-underline transition-opacity duration-150 hover:opacity-80 focus-visible:opacity-80"
        >
          <AppChromeLogo />
        </Link>
      </div>

      <div className="flex-1 min-h-0" />

      <div className="shrink-0 px-4 py-4 border-t border-white/[0.06]">
        <ProfileMenu className="w-full" />
      </div>
    </aside>
  );
}
