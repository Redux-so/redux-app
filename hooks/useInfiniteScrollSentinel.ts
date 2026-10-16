"use client";

import { useEffect, useRef, type RefObject } from "react";

interface UseInfiniteScrollSentinelOptions {
  rootRef: RefObject<Element | null>;
  enabled: boolean;
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
}

/**
 * Fires `onLoadMore` when `sentinelRef` enters the scroll root (with margin).
 */
export function useInfiniteScrollSentinel({
  rootRef,
  enabled,
  hasMore,
  loading,
  onLoadMore,
}: UseInfiniteScrollSentinelOptions): RefObject<HTMLDivElement | null> {
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!enabled || !hasMore) return;
    const root = rootRef.current;
    const sentinel = sentinelRef.current;
    if (!root || !sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting && !loading) {
          onLoadMore();
        }
      },
      { root, rootMargin: "240px 0px", threshold: 0 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [enabled, hasMore, loading, onLoadMore, rootRef]);

  return sentinelRef;
}
