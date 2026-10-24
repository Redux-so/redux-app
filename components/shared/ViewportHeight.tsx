"use client";

import { useEffect } from "react";

/** Shared by workspaces and body-portaled dialogs while the keyboard is open. */
export default function ViewportHeight() {
  useEffect(() => {
    const root = document.documentElement;
    const viewport = window.visualViewport;
    const update = () => {
      if (viewport && viewport.scale !== 1) return;
      const height = viewport?.height ?? window.innerHeight;
      root.style.setProperty("--app-height", `${Math.round(height)}px`);
      root.style.setProperty("--app-top", `${Math.round(viewport?.offsetTop ?? 0)}px`);
      root.dataset.keyboardOpen = String(window.innerHeight - height > 150);
    };
    update();
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      root.style.removeProperty("--app-height");
      root.style.removeProperty("--app-top");
      delete root.dataset.keyboardOpen;
    };
  }, []);
  return null;
}
