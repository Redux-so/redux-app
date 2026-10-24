"use client";

import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  const query = window.matchMedia("(max-width: 1023px)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** Matches the layout's lg breakpoint; server rendering remains deterministic. */
export function useMobileLayout() {
  return useSyncExternalStore(subscribe, () => window.matchMedia("(max-width: 1023px)").matches, () => false);
}
