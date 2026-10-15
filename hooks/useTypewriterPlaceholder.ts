"use client";

import { useEffect, useRef, useState } from "react";

export type TypewriterPhase = "typing" | "pause-full" | "erasing" | "pause-empty";

export interface UseTypewriterPlaceholderOptions {
  /** Delay between each character while typing (ms). */
  typeMs?: number;
  /** Delay between each character while erasing (ms). */
  eraseMs?: number;
  /** Pause when the full string is visible (ms). */
  pauseFullMs?: number;
  /** Pause on empty string before typing again (ms). */
  pauseEmptyMs?: number;
}

const DEFAULT_OPTIONS: Required<UseTypewriterPlaceholderOptions> = {
  typeMs: 65,
  eraseMs: 35,
  pauseFullMs: 2000,
  pauseEmptyMs: 400,
};

/**
 * Character-by-character typewriter placeholder text.
 * Pass `active: false` to halt and reset (e.g. on input focus or when value is non-empty).
 */
export function useTypewriterPlaceholder(
  text: string,
  active: boolean,
  options: UseTypewriterPlaceholderOptions = {},
) {
  const { typeMs, eraseMs, pauseFullMs, pauseEmptyMs } = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  const [displayText, setDisplayText] = useState("");
  const [cursorVisible, setCursorVisible] = useState(true);

  const indexRef = useRef(0);
  const phaseRef = useRef<TypewriterPhase>("typing");

  useEffect(() => {
    if (!active) return;

    indexRef.current = 0;
    phaseRef.current = "typing";

    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setDisplayText("");
    });
    let timeoutId: ReturnType<typeof setTimeout>;

    const schedule = (delay: number, fn: () => void) => {
      timeoutId = setTimeout(() => {
        if (!cancelled) fn();
      }, delay);
    };

    const tick = () => {
      if (cancelled) return;

      const phase = phaseRef.current;

      if (phase === "typing") {
        const nextIndex = indexRef.current + 1;
        if (nextIndex > text.length) {
          setDisplayText(text);
          phaseRef.current = "pause-full";
          schedule(pauseFullMs, tick);
          return;
        }
        indexRef.current = nextIndex;
        setDisplayText(text.slice(0, nextIndex));
        schedule(typeMs, tick);
        return;
      }

      if (phase === "pause-full") {
        phaseRef.current = "erasing";
        schedule(eraseMs, tick);
        return;
      }

      if (phase === "erasing") {
        const nextIndex = indexRef.current - 1;
        if (nextIndex < 0) {
          setDisplayText("");
          phaseRef.current = "pause-empty";
          schedule(pauseEmptyMs, tick);
          return;
        }
        indexRef.current = nextIndex;
        setDisplayText(text.slice(0, nextIndex));
        schedule(eraseMs, tick);
        return;
      }

      // pause-empty → loop from start
      phaseRef.current = "typing";
      indexRef.current = 0;
      schedule(typeMs, tick);
    };

    schedule(typeMs, tick);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [active, text, typeMs, eraseMs, pauseFullMs, pauseEmptyMs]);

  useEffect(() => {
    if (!active) return;

    const intervalId = setInterval(() => {
      setCursorVisible((visible) => !visible);
    }, 530);

    return () => clearInterval(intervalId);
  }, [active]);

  return {
    displayText: active ? displayText : "",
    cursorVisible: active ? cursorVisible : true,
  };
}
