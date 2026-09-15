"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

interface OnboardingScaledFrameProps {
  designWidth: number;
  designHeight: number;
  className?: string;
  children: ReactNode;
}

/** Renders children at design size, scaled down to fit (layout-safe, centered). */
export default function OnboardingScaledFrame({
  designWidth,
  designHeight,
  className = "",
  children,
}: OnboardingScaledFrameProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.4);

  useLayoutEffect(() => {
    const frameEl = frameRef.current;
    if (!frameEl) return;

    const constraintEl = frameEl.parentElement;
    if (!constraintEl) return;

    function update() {
      const box = frameRef.current?.parentElement;
      if (!box) return;
      const w = box.clientWidth;
      if (w <= 0) return;
      let next = w / designWidth;
      const h = box.clientHeight;
      if (h > 0) {
        next = Math.min(next, h / designHeight);
      }
      next = Math.min(next, 1);
      setScale(next);
    }

    update();
    const ro = new ResizeObserver(update);
    ro.observe(constraintEl);
    return () => ro.disconnect();
  }, [designWidth, designHeight]);

  const scaledWidth = designWidth * scale;
  const scaledHeight = designHeight * scale;

  return (
    <div
      ref={frameRef}
      className={`flex w-full justify-center overflow-hidden ${className}`}
      style={{ height: scaledHeight }}
    >
      {/* Clip viewport = visual size after scale (transform does not affect layout). */}
      <div
        className="relative shrink-0 overflow-hidden"
        style={{ width: scaledWidth, height: scaledHeight }}
      >
        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{
            width: designWidth,
            height: designHeight,
            transform: `scale(${scale})`,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
