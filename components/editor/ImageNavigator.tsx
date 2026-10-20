"use client";

import { useLayoutEffect, useRef, type PointerEvent } from "react";
import type { NavigatorImage } from "@/hooks/useCanvas";
import { navigatorPreviewSize, visibleImageRect, type ViewportTransform } from "@/lib/editor-viewport";
import { SURFACE_BG_MAIN, SURFACE_BORDER_RAISED } from "@/lib/surface-colors";

interface ImageNavigatorProps {
  image: NavigatorImage;
  viewport: ViewportTransform;
  onCenter: (x: number, y: number) => void;
}

export default function ImageNavigator({ image, viewport, onCenter }: ImageNavigatorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null);
  const { width, height } = navigatorPreviewSize(image.bounds, image.workspaceWidth, image.viewportHeight);
  const visible = visibleImageRect(image.bounds, viewport, image.viewportWidth, image.viewportHeight);

  // This effect runs only for preview pixels / geometry, never for viewport panning.
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = Math.ceil(width * 2);
    canvas.height = Math.ceil(height * 2);
    const scale = width / image.bounds.width;
    ctx.scale(canvas.width / width, canvas.height / height);
    ctx.scale(scale, scale);
    ctx.translate(-image.bounds.left, -image.bounds.top);
    ctx.transform(...image.matrix);
    ctx.drawImage(image.element, -image.width / 2, -image.height / 2, image.width, image.height);
  }, [image, width, height]);

  function point(event: PointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: (event.clientX - bounds.left) / bounds.width,
      y: (event.clientY - bounds.top) / bounds.height,
    };
  }

  function stopDrag(event: PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  return (
    <section aria-label="Image navigator"
      className={`absolute right-3 top-3 z-20 max-w-[calc(100%-24px)] overflow-hidden border ${SURFACE_BG_MAIN} ${SURFACE_BORDER_RAISED}`}
      style={{ width }}>
      <div role="button" tabIndex={0}
        aria-label="Pan image. Click to center, drag the viewport rectangle, or use arrow keys. Enter centers the image."
        className={`relative w-full touch-none select-none overflow-hidden cursor-crosshair focus-visible:outline focus-visible:outline-2 focus-visible:outline-white ${SURFACE_BG_MAIN}`}
        style={{ aspectRatio: `${width} / ${height}` }}
        onKeyDown={(event) => {
          const directions: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
          const direction = directions[event.key];
          if (direction) {
            event.preventDefault();
            const step = event.shiftKey ? 0.2 : 0.05;
            onCenter(visible.left + visible.width / 2 + direction[0] * step,
              visible.top + visible.height / 2 + direction[1] * step);
          } else if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onCenter(0.5, 0.5);
          }
        }}
        onPointerDown={(event) => {
          if (event.button !== 0 || dragRef.current) return;
          event.preventDefault();
          event.currentTarget.focus();
          const { x, y } = point(event);
          const inside = x >= visible.left && x <= visible.left + visible.width && y >= visible.top && y <= visible.top + visible.height;
          dragRef.current = { pointerId: event.pointerId,
            offsetX: inside ? x - (visible.left + visible.width / 2) : 0,
            offsetY: inside ? y - (visible.top + visible.height / 2) : 0 };
          event.currentTarget.setPointerCapture(event.pointerId);
          if (!inside) onCenter(x, y);
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (drag?.pointerId !== event.pointerId) return;
          const { x, y } = point(event);
          onCenter(x - drag.offsetX, y - drag.offsetY);
        }}
        onPointerUp={stopDrag} onPointerCancel={stopDrag} onLostPointerCapture={() => { dragRef.current = null; }}>
        <canvas ref={canvasRef} aria-hidden className="absolute inset-0 h-full w-full pointer-events-none" />
        <div aria-hidden className="absolute pointer-events-none border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.85)]"
          style={{ left: `${visible.left * 100}%`,
            top: `${visible.top * 100}%`,
            width: `${visible.width * 100}%`,
            height: `${visible.height * 100}%` }} />
      </div>
    </section>
  );
}
