"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";

/** Touch cards reveal actions first, without accidentally activating a hidden button. */
export function usePhotoCardControls(imageId: string) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!visible) return;
    function dismissOutside(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const menu = target.closest("[data-photo-card-owner]");
      if (!ref.current?.contains(target) && menu?.getAttribute("data-photo-card-owner") !== imageId) {
        setVisible(false);
      }
    }
    function dismissOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setVisible(false);
    }
    document.addEventListener("pointerdown", dismissOutside, true);
    document.addEventListener("keydown", dismissOnEscape);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside, true);
      document.removeEventListener("keydown", dismissOnEscape);
    };
  }, [visible, imageId]);

  function onClick(event: MouseEvent<HTMLDivElement>) {
    if (!ref.current?.contains(event.target as Node)) return;
    if (!window.matchMedia("(max-width: 1023px), (hover: none)").matches) return;
    if ((event.target as Element).closest("button, [role=dialog]")) return;
    setVisible((previous) => !previous);
  }

  return { ref, onClick, tabIndex: 0, "data-controls-visible": visible };
}
