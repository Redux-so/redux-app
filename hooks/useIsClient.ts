"use client";

import { useSyncExternalStore } from "react";

/** True on the client after hydration — false during SSR and the first server pass. */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}
