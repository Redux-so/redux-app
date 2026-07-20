"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useReducedMotion } from "framer-motion";
import { USAGE_RING_CONFIG } from "@/constants/usage-ring";
import {
  deriveUsageRingState,
  type UsageQuotaSnapshot,
} from "@/lib/usage-ring-state";

const RING_RADIUS = 7.5;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

const CHAT_SURFACE_SHADOW =
  "shadow-[0_1px_3px_rgba(0,0,0,0.32),0_2px_8px_rgba(0,0,0,0.14)]";

function ringOffsetForProgress(progress: number): number {
  const clamped = Math.max(0, Math.min(1, progress));
  return RING_CIRCUMFERENCE * (1 - clamped);
}

function UsageRingSvg({
  fillProgress,
  isDepleted,
  reduceMotion,
}: {
  fillProgress: number;
  isDepleted: boolean;
  reduceMotion: boolean;
}) {
  const targetOffset = ringOffsetForProgress(fillProgress);
  const [displayOffset, setDisplayOffset] = useState<number | null>(null);
  const [transitionEnabled, setTransitionEnabled] = useState(false);
  const hasInitializedRef = useRef(false);

  useEffect(() => {
    if (!hasInitializedRef.current) {
      hasInitializedRef.current = true;
      setDisplayOffset(RING_CIRCUMFERENCE);
      if (reduceMotion) {
        setTransitionEnabled(true);
        setDisplayOffset(targetOffset);
        return;
      }
      const frame = requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setTransitionEnabled(true);
          setDisplayOffset(targetOffset);
        });
      });
      return () => cancelAnimationFrame(frame);
    }

    setDisplayOffset(targetOffset);
  }, [fillProgress, targetOffset, reduceMotion]);

  const strokeTransition =
    transitionEnabled && !reduceMotion
      ? `stroke-dashoffset ${USAGE_RING_CONFIG.ringTransitionMs}ms ease-out`
      : "none";

  const trackClass = isDepleted
    ? "text-[#78350f] animate-pulse"
    : "text-[#444444]";
  const progressClass = isDepleted
    ? "text-[#f59e0b] animate-pulse"
    : "text-[#888888]";

  return (
    <svg viewBox="0 0 20 20" className="h-5 w-5 shrink-0" aria-hidden>
      <g transform="rotate(-90 10 10)">
        <circle
          cx="10"
          cy="10"
          r={RING_RADIUS}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={trackClass}
        />
        <circle
          cx="10"
          cy="10"
          r={RING_RADIUS}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={displayOffset ?? RING_CIRCUMFERENCE}
          style={{ transition: strokeTransition }}
          className={progressClass}
        />
      </g>
    </svg>
  );
}

function UsageRingLoading() {
  return (
    <svg viewBox="0 0 20 20" className="h-5 w-5 shrink-0" aria-hidden>
      <circle
        cx="10"
        cy="10"
        r={RING_RADIUS}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="text-[#444444]"
      />
    </svg>
  );
}

export interface UsageRingProps {
  quota: UsageQuotaSnapshot | null;
  onPurchaseClick?: () => void;
  reduceMotion?: boolean;
}

/**
 * Stateful chat usage indicator — free-tier progress, credit balance, and
 * depleted purchase entry points in one ring.
 */
export default function UsageRing({
  quota,
  onPurchaseClick,
  reduceMotion: reduceMotionProp,
}: UsageRingProps) {
  const prefersReducedMotion = useReducedMotion();
  const reduceMotion = reduceMotionProp ?? !!prefersReducedMotion;

  const view = deriveUsageRingState(quota);
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [isCoarsePointer, setIsCoarsePointer] = useState(false);
  const [tooltipCoords, setTooltipCoords] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const updateTooltipPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const tooltipHeight = tooltipRef.current?.offsetHeight ?? 56;
    const gap = 8;

    setTooltipCoords({
      left: rect.left + rect.width / 2,
      top: rect.top - tooltipHeight - gap,
    });
  }, []);

  useLayoutEffect(() => {
    if (!tooltipVisible) return;
    updateTooltipPosition();
  }, [tooltipVisible, view?.tooltipLine, view?.purchaseActionLabel, updateTooltipPosition]);

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    setIsCoarsePointer(mq.matches);
    const onChange = () => setIsCoarsePointer(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!tooltipVisible) return;

    function handleReposition() {
      updateTooltipPosition();
    }

    function handleOutside(e: PointerEvent) {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (tooltipRef.current?.contains(target)) return;
      setTooltipVisible(false);
    }

    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);
    if (isCoarsePointer) {
      document.addEventListener("pointerdown", handleOutside);
    }

    return () => {
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
      document.removeEventListener("pointerdown", handleOutside);
    };
  }, [tooltipVisible, isCoarsePointer, updateTooltipPosition]);

  function clearHoverTimer() {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  }

  function showTooltip() {
    clearHoverTimer();
    hoverTimerRef.current = setTimeout(() => {
      setTooltipVisible(true);
    }, USAGE_RING_CONFIG.tooltipDelayMs);
  }

  function hideTooltip() {
    clearHoverTimer();
    setTooltipVisible(false);
  }

  function handlePurchaseAction(e: React.MouseEvent) {
    e.stopPropagation();
    setTooltipVisible(false);
    onPurchaseClick?.();
  }

  function handleTriggerClick() {
    if (view?.opensPurchaseOnClick) {
      onPurchaseClick?.();
      return;
    }
    if (isCoarsePointer) {
      setTooltipVisible((prev) => !prev);
    }
  }

  const ariaLabel = view?.tooltipLine ?? USAGE_RING_CONFIG.copy.loading;

  const tooltip =
    tooltipVisible && view && tooltipCoords && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={tooltipRef}
            role="tooltip"
            style={{
              position: "fixed",
              top: tooltipCoords.top,
              left: tooltipCoords.left,
              transform: "translateX(-50%)",
              zIndex: 90,
            }}
            className={[
              "pointer-events-auto whitespace-nowrap rounded-md border border-white/[0.08] bg-[#111111] px-3 py-2",
              CHAT_SURFACE_SHADOW,
            ].join(" ")}
          >
            <p className="text-[12px] leading-snug text-[#888888]">
              {view.tooltipLine}
            </p>
            {view.purchaseActionLabel && onPurchaseClick && (
              <button
                type="button"
                onClick={handlePurchaseAction}
                className="mt-1.5 block text-[12px] font-medium text-[#B07EF0] hover:text-[#c9a0f5] transition-colors cursor-pointer"
              >
                {view.purchaseActionLabel}
              </button>
            )}
            <div
              aria-hidden
              className="absolute left-1/2 top-full -mt-px -translate-x-1/2 border-[5px] border-transparent border-t-[#111111]"
            />
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={[
          "relative inline-flex shrink-0 items-center justify-center rounded-md p-0.5",
          "text-[#888888] transition-colors",
          view?.opensPurchaseOnClick
            ? "cursor-pointer hover:text-[#f59e0b] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#f59e0b]/50"
            : "cursor-default focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/20",
        ].join(" ")}
        aria-label={ariaLabel}
        onMouseEnter={() => {
          if (isCoarsePointer) return;
          showTooltip();
        }}
        onMouseLeave={() => {
          if (isCoarsePointer) return;
          hideTooltip();
        }}
        onFocus={() => showTooltip()}
        onBlur={() => hideTooltip()}
        onClick={handleTriggerClick}
      >
        {!view ? (
          <UsageRingLoading />
        ) : (
          <UsageRingSvg
            fillProgress={view.fillProgress}
            isDepleted={view.isDepleted}
            reduceMotion={reduceMotion}
          />
        )}
      </button>
      {tooltip}
    </>
  );
}
