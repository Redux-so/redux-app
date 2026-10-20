"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { rememberVisitedPage } from "@/lib/last-visited-page";

/** sessionStorage survives address-bar navigation and stays isolated per tab */
export default function LastVisitedPage() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    // The editor records its URL only after the requested image is confirmed.
    if (pathname.replace(/\/+$/, "") === "/editor") return;
    rememberVisitedPage(`${pathname}${searchParams.size ? `?${searchParams}` : ""}${window.location.hash}`);
  }, [pathname, searchParams]);

  return null;
}
