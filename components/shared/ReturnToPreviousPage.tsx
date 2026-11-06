"use client";

import { appPath } from "@/lib/app-path";

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
        destination = safePreviousPage(`${referrer.pathname}${referrer.search}${referrer.hash}`, { browserUrl: true });
      }
    }
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const target = destination && appPath(destination);
    window.location.replace(target && target !== current ? target : appPath("/"));
  }, []);

  return (
    <div className="flex min-h-screen flex-1 items-center justify-center bg-[#161616]">
      <LoadingOverlay message="Returning to your page" />
      <noscript><Link href="/">Return to Redux</Link></noscript>
    </div>
  );
}
