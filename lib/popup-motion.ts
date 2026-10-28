"use client";

import { useReducedMotion } from "framer-motion";

/** Keep in sync with the popup animation classes in globals.css. */
export function usePopupMotion(backdrop = false) {
  const reduceMotion = useReducedMotion();
  const hidden = backdrop ? { opacity: 0 } : { opacity: 0, y: 8 };
  return {
    initial: reduceMotion ? false as const : hidden,
    animate: backdrop ? { opacity: 1 } : { opacity: 1, y: 0 },
    exit: reduceMotion ? { opacity: 1 } : hidden,
    transition: { duration: reduceMotion ? 0 : 0.2, ease: "easeOut" as const },
  };
}
