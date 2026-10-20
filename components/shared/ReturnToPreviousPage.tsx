"use client";

import { useEffect } from "react";
import Link from "next/link";
import { LAST_VISITED_PAGE_KEY, safePreviousPage } from "@/lib/last-visited-page";
import { LoadingOverlay } from "@/components/shared/LoadingSpinner";

export default function ReturnToPreviousPage() {
  useEffect(() => {
    let destination: string | null = null;
    try {
      destination = safePreviousPage(sessionStorage.getItem(LAST_VISITED_PAGE_KEY));
    } catch {
      // Fall back to a same-origin referrer if storage is unavailable
    }
    if (!destination && document.referrer) {
      const referrer = new URL(document.referrer);
      if (referrer.origin === window.location.origin) {
        destination = safePreviousPage(`${referrer.pathname}${referrer.search}${referrer.hash}`);
      }
    }
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.location.replace(destination && destination !== current ? destination : "/");
  }, []);

  return (
    <div className="flex min-h-screen flex-1 items-center justify-center bg-[#161616]">
      <LoadingOverlay message="Returning to your page" srOnlyMessage variant="muted" />
      <noscript><Link href="/">Return to Redux</Link></noscript>
    </div>
  );
}
