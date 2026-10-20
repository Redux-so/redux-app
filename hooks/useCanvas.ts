"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Canvas, FabricImage, FabricObject, Point as FabricPoint } from "fabric";
import { normalizeBrushSize, type BrushSizes, type RetouchTool } from "@/lib/retouch-brush";
import { constrainViewport, type ViewportTransform, type ViewportRect } from "@/lib/editor-viewport";
import { type AdjustmentKey } from "@/constants/adjustments";
import { transformedSource, drawSourceMask } from "@/lib/canvas-image-geometry";
import { renderInteractiveImage } from "@/lib/interactive-image-preview";
import { transformedDimensions, type ImageTransform } from "@/lib/image-transform";

export {
  getTemperatureOverlay,
  getTintOverlay,
  getHueOverlay,
  getColorOverlays,
  type ColorOverlay,
  type ActiveColorOverlays,
} from "@/lib/color-overlays";

export type CanvasAdjustments = Record<AdjustmentKey, number>;

export interface CanvasMasks {
  heal: FabricObject[];
  eraser: FabricObject[];
  blur: FabricObject[];
}

export interface ImageBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface NavigatorImage {
  element: CanvasImageSource;
  matrix: ViewportTransform;
  bounds: ViewportRect;
  width: number;
  height: number;
  viewportWidth: number;
  viewportHeight: number;
  workspaceWidth: number;
}

// Match the original comparison layer's centered 95% contain fit.
function originalNavigatorImage(element: HTMLImageElement, width: number, height: number, workspaceWidth: number): NavigatorImage {
  const scale = Math.min(width / element.naturalWidth, height / element.naturalHeight) * 0.95;
  const imageWidth = element.naturalWidth * scale;
  const imageHeight = element.naturalHeight * scale;
  return {
    element, matrix: [scale, 0, 0, scale, width / 2, height / 2],
    bounds: { left: (width - imageWidth) / 2, top: (height - imageHeight) / 2, width: imageWidth, height: imageHeight },
    width: element.naturalWidth, height: element.naturalHeight,
    viewportWidth: width, viewportHeight: height, workspaceWidth,
  };
}

export { createExpandedCanvas, type ExpandDirection } from "@/lib/canvas-expand";

// ---------------------------------------------------------------------------
// Internal transform state — stored in a ref so mutations don't re-render
// ---------------------------------------------------------------------------
type TransformState = ImageTransform;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export function useCanvas(
  imageUrl: string | null,
  adjustments: CanvasAdjustments,
  savedTransform?: ImageTransform | null,
  onMasksChanged?: (masks: CanvasMasks, checkpoint?: boolean) => void,
  onTransformChanged?: (transform: ImageTransform, checkpoint?: boolean) => void,
) {
  const onTransformChangedRef = useRef(onTransformChanged);
  onTransformChangedRef.current = onTransformChanged;
  const onMasksChangedRef = useRef(onMasksChanged);
  onMasksChangedRef.current = onMasksChanged;
  const loadGenerationRef = useRef(0);
  const brushGenerationRef = useRef(0);
  const cropGenerationRef = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // containerRef is attached to the outer wrapper div in Canvas.tsx so we can
  // read the available dimensions before Fabric sets them on the canvas element.
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fabricRef = useRef<Canvas | null>(null);
  const [brushSizes, setBrushSizes] = useState<BrushSizes>({ heal: 20, eraser: 20, blur: 20 });
  const brushSizesRef = useRef(brushSizes);
  const activeBrushRef = useRef<RetouchTool | null>(null);
  const brushCursorRef = useRef<HTMLDivElement | null>(null);
  const brushPointerRef = useRef<{ x: number; y: number } | null>(null);
  const PointRef = useRef<typeof FabricPoint | null>(null);
  const bgImageRef = useRef<FabricImage | null>(null);
  const sourceImageRef = useRef<FabricImage | null>(null);
  const [sourceVersion, setSourceVersion] = useState(0);
  const localPreviewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cropRectRef = useRef<any>(null);
  const transformRef = useRef<TransformState>(
    savedTransform
      ? { ...savedTransform }
      : {
          rotation: 0,
          flipX: false,
          flipY: false,
          straighten: 0,
        },
  );

  const [zoom, setZoom] = useState(1);
  // The navigator observes Fabric's viewport; it never owns a second viewport.
  const [viewportTransform, setViewportTransform] = useState<ViewportTransform>([1, 0, 0, 1, 0, 0]);
  const layoutRef = useRef<{ bounds: ViewportRect; width: number; height: number } | null>(null);
  const [navigatorImage, setNavigatorImage] = useState<NavigatorImage | null>(null);
  const [originalElement, setOriginalElement] = useState<HTMLImageElement | null>(null);
  const originalElementRef = useRef<HTMLImageElement | null>(null);
  const onOriginalImageLoad = useCallback((element: HTMLImageElement) => {
    originalElementRef.current = element;
    setOriginalElement(element);
  }, []);
  const [showBefore, setShowBefore] = useState(false);
  const showBeforeRef = useRef(showBefore);
  showBeforeRef.current = showBefore;
  const [canvasReady, setCanvasReady] = useState(false);
  const [isCropping, setIsCropping] = useState(false);
  const [isHealBrush, setIsHealBrush] = useState(false);
  // Tracks the rendered bounds of the background image inside the Fabric canvas.
  // Used by Canvas.tsx to clip the vignette/grain overlays to the image area.
  const [imageBounds, setImageBounds] = useState<ImageBounds | null>(null);
  // The URL of the image currently rendered on the canvas. Starts as imageUrl
  // prop but can diverge after AI operations (e.g. background removal) that
  // replace the canvas image with a new URL via loadImageUrl().
  const [activeImageUrl, setActiveImageUrl] = useState<string | null>(imageUrl);
  // ---------------------------------------------------------------------------
  // Compute the image's rendered bounds from the current FabricImage state.
  // Must be called after any operation that moves/scales/rotates the image.
  // ---------------------------------------------------------------------------
  const updateImageBounds = useCallback(() => {
    const canvas = fabricRef.current;
    const img = bgImageRef.current;
    if (!canvas || !img) return;

    const bounds = img.getBoundingRect();
    layoutRef.current = { bounds, width: canvas.getWidth(), height: canvas.getHeight() };
    setImageBounds({ left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height });
    setNavigatorImage({ element: img.getElement(), matrix: [...img.calcTransformMatrix()],
      bounds, width: img.width, height: img.height,
      viewportWidth: canvas.getWidth(), viewportHeight: canvas.getHeight(),
      workspaceWidth: containerRef.current?.clientWidth ?? canvas.getWidth() });
  }, []);

  // Both previews use Fabric's single camera, with bounds for the displayed image.
  const displayedBounds = useCallback((width: number, height: number) => {
    if (showBeforeRef.current && originalElementRef.current) {
      return originalNavigatorImage(originalElementRef.current, width, height, width).bounds;
    }
    return bgImageRef.current?.getBoundingRect();
  }, []);

  const displayedNavigator = useMemo(() => {
    if (!showBefore || !originalElement || !navigatorImage) return navigatorImage;
    return originalNavigatorImage(originalElement, navigatorImage.viewportWidth, navigatorImage.viewportHeight, navigatorImage.workspaceWidth);
  }, [showBefore, originalElement, navigatorImage]);

  const updateBrushCursor = useCallback(() => {
    const canvas = fabricRef.current;
    const cursor = brushCursorRef.current;
    const pointer = brushPointerRef.current;
    if (!canvas || !cursor) return;
    const active = activeBrushRef.current;
    const rect = canvas.upperCanvasEl.getBoundingClientRect();
    const visible = active && canvas.isDrawingMode && !showBeforeRef.current && pointer &&
      pointer.x >= rect.left && pointer.x <= rect.right && pointer.y >= rect.top && pointer.y <= rect.bottom;
    cursor.style.display = visible ? "block" : "none";
    canvas.freeDrawingCursor = visible ? "none" : "crosshair";
    if (!visible) {
      canvas.upperCanvasEl.style.cursor = canvas.isDrawingMode ? "crosshair" : canvas.defaultCursor;
      return;
    }
    const parentRect = cursor.parentElement!.getBoundingClientRect();
    const diameter = brushSizesRef.current[active] * canvas.getZoom() * rect.width / canvas.getWidth();
    cursor.style.width = `${diameter}px`;
    cursor.style.height = `${diameter}px`;
    cursor.style.left = `${pointer.x - parentRect.left}px`;
    cursor.style.top = `${pointer.y - parentRect.top}px`;
    canvas.upperCanvasEl.style.cursor = "none";
  }, []);

  const setBrushSize = useCallback((tool: RetouchTool, size: number) => {
    const width = normalizeBrushSize(size);
    const next = { ...brushSizesRef.current, [tool]: width };
    brushSizesRef.current = next;
    setBrushSizes(next);
    const canvas = fabricRef.current;
    if (activeBrushRef.current === tool && canvas?.freeDrawingBrush) {
      canvas.freeDrawingBrush.width = width;
    }
    updateBrushCursor();
  }, [updateBrushCursor]);

  const syncViewport = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const bounds = displayedBounds(canvas.getWidth(), canvas.getHeight());
    const current = [...canvas.viewportTransform] as ViewportTransform;
    const next = bounds ? constrainViewport(current, bounds, canvas.getWidth(), canvas.getHeight()) : current;
    canvas.setViewportTransform(next);
    canvas.requestRenderAll();
    setZoom(parseFloat(canvas.getZoom().toFixed(2)));
    setViewportTransform(next);
    updateBrushCursor();
  }, [displayedBounds, updateBrushCursor]);

  useLayoutEffect(() => {
    syncViewport();
  }, [showBefore, originalElement, syncViewport]);

  const centerNavigator = useCallback((x: number, y: number) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const bounds = displayedBounds(canvas.getWidth(), canvas.getHeight());
    if (!bounds) return;
    const vpt = [...canvas.viewportTransform] as ViewportTransform;
    vpt[4] = canvas.getWidth() / 2 - (bounds.left + x * bounds.width) * vpt[0];
    vpt[5] = canvas.getHeight() / 2 - (bounds.top + y * bounds.height) * vpt[3];
    canvas.setViewportTransform(vpt);
    syncViewport();
  }, [syncViewport, displayedBounds]);

  const relayoutCanvas = useCallback(() => {
    const canvas = fabricRef.current;
    const container = containerRef.current;
    const img = bgImageRef.current;
    if (!canvas || !container) return;

    const previous = layoutRef.current;
    const oldBounds = showBeforeRef.current
      ? displayedBounds(previous?.width ?? canvas.getWidth(), previous?.height ?? canvas.getHeight())
      : previous?.bounds ?? img?.getBoundingRect();
    const vpt = [...canvas.viewportTransform] as ViewportTransform;
    const centerX = oldBounds ? (((previous?.width ?? canvas.getWidth()) / 2 - vpt[4]) / vpt[0] - oldBounds.left) / oldBounds.width : 0.5;
    const centerY = oldBounds ? (((previous?.height ?? canvas.getHeight()) / 2 - vpt[5]) / vpt[3] - oldBounds.top) / oldBounds.height : 0.5;
    const PADDING = 64;
    const w = Math.max(1, container.clientWidth - PADDING);
    const h = Math.max(1, container.clientHeight - PADDING);
    if (canvas.getWidth() !== w || canvas.getHeight() !== h) {
      canvas.setDimensions({ width: w, height: h });
    }

    if (img) {
      const displayTransform = transformRef.current;
      const size = transformedDimensions(img.width ?? w, img.height ?? h, displayTransform);
      const scale = Math.min(w / size.width, h / size.height) * 0.95;
      const { rotation, flipX, flipY, straighten } = displayTransform;
      img.set({
        scaleX: scale,
        scaleY: scale,
        originX: "center",
        originY: "center",
        left: w / 2,
        top: h / 2,
        angle: rotation + straighten,
        flipX,
        flipY,
      });
      img.setCoords();
      const bounds = displayedBounds(w, h) ?? img.getBoundingRect();
      vpt[4] = w / 2 - (bounds.left + centerX * bounds.width) * vpt[0];
      vpt[5] = h / 2 - (bounds.top + centerY * bounds.height) * vpt[3];
      canvas.setViewportTransform(vpt);
      syncViewport();
      updateImageBounds();
    }
    // Resizing clears the backing canvas. ResizeObserver runs after animation
    // callbacks, so waiting for requestRenderAll would expose a blank frame.
    // Paint the final geometry now and cancel Fabric's queued duplicate render.
    canvas.renderAll();
  }, [updateImageBounds, syncViewport, displayedBounds]);

  // Apply the current transform ref values to the loaded background image
  const applyTransform = useCallback(() => {
    relayoutCanvas();
  }, [relayoutCanvas]);

  useEffect(() => {
    if (!savedTransform) return;
    transformRef.current = { ...savedTransform };
    if (canvasReady) applyTransform();
  }, [savedTransform, canvasReady, applyTransform]);

  // Stores the DOM event listener teardown so it can be called from the
  // useEffect cleanup even though the listeners are added inside an async block.
  const eventCleanupRef = useRef<(() => void) | null>(null);
  const healPathsRef = useRef<FabricObject[]>([]);
  const healPathHandlerRef = useRef<((e: { path: FabricObject }) => void) | null>(null);
  const eraserPathsRef = useRef<FabricObject[]>([]);
  const eraserPathHandlerRef = useRef<((e: { path: FabricObject }) => void) | null>(null);
  const blurPathsRef = useRef<FabricObject[]>([]);
  const blurPathHandlerRef = useRef<((e: { path: FabricObject }) => void) | null>(null);

  // ---------------------------------------------------------------------------
  // Initialize Fabric canvas
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;

    /** In-flight Fabric instance until assigned to fabricRef (avoids async race on unmount). */
    let canvasInstance: Canvas | undefined;
    let disposed = false;

    (async () => {
      const { Canvas: FabricCanvas, Point } = await import("fabric");
      if (disposed) return;

      PointRef.current = Point;
      canvasInstance = new FabricCanvas(el, {
        selection: false,
        renderOnAddRemove: false,
      });
      const canvas = canvasInstance;

      if (disposed) {
        canvas.dispose();
        canvasInstance = undefined;
        return;
      }

      // Size the canvas to its outer container (the flex-1 wrapper).
      // The canvas element defaults to 300×150 — do NOT use el.offsetWidth here.
      const container = containerRef.current;
      const PADDING = 64; // p-8 (32px) × 2 sides
      const w = container ? Math.max(1, container.clientWidth - PADDING) : 800;
      const h = container ? Math.max(1, container.clientHeight - PADDING) : 600;
      canvas.setDimensions({ width: w, height: h });

      // Fabric wraps the canvas element in a div (.canvas-container).
      // We attach our custom events to that wrapper so they cover both the
      // lower canvas (rendering) and the upper canvas (Fabric interactions).
      const wrapper =
        (canvas as unknown as { wrapperEl?: HTMLElement }).wrapperEl ??
        el.parentElement ??
        el;
      // Include the read-only original comparison layer beside Fabric's wrapper.
      const eventTarget = wrapper.parentElement ?? wrapper;
      const brushCursor = document.createElement("div");
      brushCursor.setAttribute("aria-hidden", "true");
      brushCursor.dataset.brushCursor = "true";
      Object.assign(brushCursor.style, {
        position: "absolute", pointerEvents: "none", display: "none", zIndex: "10",
        border: "1px solid white", boxShadow: "0 0 0 1px rgba(0,0,0,0.8)",
        borderRadius: "50%", boxSizing: "border-box", transform: "translate(-50%, -50%)",
      });
      wrapper.appendChild(brushCursor);
      brushCursorRef.current = brushCursor;
      const handlePointerLeave = () => {
        brushPointerRef.current = null;
        updateBrushCursor();
      };

      // ── Mouse wheel zoom ──────────────────────────────────────────────────
      // MUST use a native listener with { passive: false } so we can call
      // preventDefault().  Fabric's canvas.on("mouse:wheel") may register the
      // listener passively, which silently ignores preventDefault and causes
      // the page to scroll instead of zooming.
      const handleWheel = (e: WheelEvent) => {
        e.preventDefault();
        e.stopPropagation();

        const Pt = PointRef.current;
        if (!Pt) return;

        let z = canvas.getZoom();
        z *= 0.999 ** e.deltaY;
        z = Math.min(5.0, Math.max(0.1, parseFloat(z.toFixed(3))));

        const rect = wrapper.getBoundingClientRect();
        canvas.zoomToPoint(
          new Pt(e.clientX - rect.left, e.clientY - rect.top),
          z,
        );
        syncViewport();
      };

      // ── Click-drag pan ────────────────────────────────────────────────────
      // Left-click drag (button 0) OR middle-mouse drag (button 1) pans the
      // viewport.  During crop mode canvas.selection is true, so we leave
      // pointer events alone and let Fabric handle the crop rect.
      let isPanning = false;
      let panLastX = 0;
      let panLastY = 0;

      const handlePointerDown = (e: PointerEvent) => {
        // Crop mode: let Fabric handle its interactive rect
        if (canvas.selection && !showBeforeRef.current) return;
        // Heal brush / free drawing: let Fabric handle strokes
        if (canvas.isDrawingMode && !showBeforeRef.current) return;
        if (e.button !== 0 && e.button !== 1) return;
        isPanning = true;
        panLastX = e.clientX;
        panLastY = e.clientY;
        try { eventTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
        eventTarget.style.cursor = "grabbing";
      };

      const handlePointerMove = (e: PointerEvent) => {
        brushPointerRef.current = { x: e.clientX, y: e.clientY };
        updateBrushCursor();
        if (!isPanning) return;
        const dx = e.clientX - panLastX;
        const dy = e.clientY - panLastY;
        panLastX = e.clientX;
        panLastY = e.clientY;
        const vpt = canvas.viewportTransform.slice() as [number, number, number, number, number, number];
        vpt[4] += dx;
        vpt[5] += dy;
        canvas.setViewportTransform(vpt);
        syncViewport();
      };

      const handlePointerUp = (e: PointerEvent) => {
        if (!isPanning) return;
        isPanning = false;
        eventTarget.style.cursor = "";
        try { eventTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
        syncViewport();
      };

      eventTarget.addEventListener("pointerleave", handlePointerLeave);
      eventTarget.addEventListener("wheel", handleWheel, { passive: false });
      eventTarget.addEventListener("pointerdown", handlePointerDown);
      eventTarget.addEventListener("pointermove", handlePointerMove);
      eventTarget.addEventListener("pointerup", handlePointerUp);
      eventTarget.addEventListener("pointercancel", handlePointerUp);

      // Store teardown so the useEffect cleanup (below) can call it even
      // though it runs synchronously while this async block ran later.
      eventCleanupRef.current = () => {
        eventTarget.removeEventListener("pointerleave", handlePointerLeave);
        brushCursor.remove();
        brushCursorRef.current = null;
        brushPointerRef.current = null;
        activeBrushRef.current = null;
        eventTarget.removeEventListener("wheel", handleWheel);
        eventTarget.removeEventListener("pointerdown", handlePointerDown);
        eventTarget.removeEventListener("pointermove", handlePointerMove);
        eventTarget.removeEventListener("pointerup", handlePointerUp);
        eventTarget.removeEventListener("pointercancel", handlePointerUp);
      };

      if (disposed) {
        eventCleanupRef.current?.();
        eventCleanupRef.current = null;
        canvas.dispose();
        canvasInstance = undefined;
        return;
      }

      fabricRef.current = canvas;
      setCanvasReady(true);
    })();

    return () => {
      disposed = true;
      healPathHandlerRef.current = null;
      healPathsRef.current = [];
      eraserPathHandlerRef.current = null;
      eraserPathsRef.current = [];
      blurPathHandlerRef.current = null;
      blurPathsRef.current = [];

      eventCleanupRef.current?.();
      eventCleanupRef.current = null;

      if (fabricRef.current) {
        fabricRef.current.dispose();
        fabricRef.current = null;
      } else {
        canvasInstance?.dispose();
      }
      canvasInstance = undefined;

      bgImageRef.current = null;
      setCanvasReady(false);
      setImageBounds(null);
      setNavigatorImage(null);
      layoutRef.current = null;
      setIsHealBrush(false);
    };
  }, [syncViewport, updateBrushCursor]);

  // ---------------------------------------------------------------------------
  // Keep activeImageUrl in sync with the imageUrl prop.
  // When the user navigates to a different image, reset to the new original URL.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    setActiveImageUrl(imageUrl);
  }, [imageUrl]);

  // ---------------------------------------------------------------------------
  // Load background image
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!canvasReady || !imageUrl || !fabricRef.current) return;

    const canvas = fabricRef.current;
    let cancelled = false;
    const generation = ++loadGenerationRef.current;

    (async () => {
      const { FabricImage } = await import("fabric");
      if (cancelled) return;

      const img = await FabricImage.fromURL(imageUrl, { crossOrigin: "anonymous" });
      if (cancelled || generation !== loadGenerationRef.current) return;

      const w = canvas.getWidth();
      const h = canvas.getHeight();
      const size = transformedDimensions(img.width ?? w, img.height ?? h, transformRef.current);
      const scale = Math.min(w / size.width, h / size.height) * 0.95;
      const { rotation, flipX, flipY, straighten } = transformRef.current;

      img.set({
        scaleX: scale,
        scaleY: scale,
        originX: "center",
        originY: "center",
        left: w / 2,
        top: h / 2,
        angle: rotation + straighten,
        flipX,
        flipY,
      });

      sourceImageRef.current = img;
      setSourceVersion((v) => v + 1);
      bgImageRef.current = img;
      canvas.backgroundImage = img as unknown as import("fabric").FabricObject;
      canvas.renderAll();

      updateImageBounds();
    })();

    return () => { cancelled = true; };
  }, [imageUrl, canvasReady, updateImageBounds]);

  // Resize Fabric canvas when the container grows or shrinks (e.g. panel collapse).
  useEffect(() => {
    if (!canvasReady) return;
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      relayoutCanvas();
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [canvasReady, relayoutCanvas]);

  // Feedback is local and painted before the browser's next frame. Never wait
  // for debounce, network, image decoding, or a previous server render to finish.
  useLayoutEffect(() => {
    const canvas = fabricRef.current;
    const source = sourceImageRef.current;
    if (!canvasReady || !canvas || !source) return;
    const pixels = source.getElement() as HTMLImageElement;
    try {
      const rendered = renderInteractiveImage(pixels, adjustments,
        localPreviewCanvasRef.current ?? undefined);
      localPreviewCanvasRef.current = rendered;
      const PreviewImage = source.constructor as typeof FabricImage;
      const preview = new PreviewImage(rendered, { objectCaching: false });
      bgImageRef.current = preview;
      canvas.backgroundImage = preview;
      setPreviewError(null);
      relayoutCanvas();
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : "Preview failed");
    }
  }, [adjustments, savedTransform, canvasReady, sourceVersion, relayoutCanvas]);

  // ---------------------------------------------------------------------------
  // Zoom — 10% increments, clamped to 10%–500%
  // Zooms to the center of the canvas.
  // ---------------------------------------------------------------------------
  const zoomIn = useCallback(() => {
    const canvas = fabricRef.current;
    const Point = PointRef.current;
    if (!canvas || !Point) return;
    const next = Math.min(parseFloat((canvas.getZoom() + 0.1).toFixed(2)), 5.0);
    canvas.zoomToPoint(new Point(canvas.getWidth() / 2, canvas.getHeight() / 2), next);
    syncViewport();
  }, [syncViewport]);

  const zoomOut = useCallback(() => {
    const canvas = fabricRef.current;
    const Point = PointRef.current;
    if (!canvas || !Point) return;
    const next = Math.max(parseFloat((canvas.getZoom() - 0.1).toFixed(2)), 0.1);
    canvas.zoomToPoint(new Point(canvas.getWidth() / 2, canvas.getHeight() / 2), next);
    syncViewport();
  }, [syncViewport]);

  const resetZoom = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    syncViewport();
  }, [syncViewport]);

  // ---------------------------------------------------------------------------
  // Before / After toggle
  // ---------------------------------------------------------------------------
  const toggleBefore = useCallback(() => setShowBefore((p) => !p), []);

  // ---------------------------------------------------------------------------
  // Rotate (multiples of 90°)
  // ---------------------------------------------------------------------------
  const rotateCW = useCallback(() => {
    transformRef.current.rotation = (transformRef.current.rotation + 90) % 360;
    applyTransform();
    onTransformChangedRef.current?.({ ...transformRef.current });
  }, [applyTransform]);

  const rotateCCW = useCallback(() => {
    transformRef.current.rotation = ((transformRef.current.rotation - 90) + 360) % 360;
    applyTransform();
    onTransformChangedRef.current?.({ ...transformRef.current });
  }, [applyTransform]);

  // ---------------------------------------------------------------------------
  // Flip
  // ---------------------------------------------------------------------------
  const flipH = useCallback(() => {
    transformRef.current.flipX = !transformRef.current.flipX;
    applyTransform();
    onTransformChangedRef.current?.({ ...transformRef.current });
  }, [applyTransform]);

  const flipV = useCallback(() => {
    transformRef.current.flipY = !transformRef.current.flipY;
    applyTransform();
    onTransformChangedRef.current?.({ ...transformRef.current });
  }, [applyTransform]);

  // ---------------------------------------------------------------------------
  // Straighten
  // ---------------------------------------------------------------------------
  const straightenImage = useCallback((degrees: number, checkpoint = true) => {
    transformRef.current.straighten = degrees;
    applyTransform();
    onTransformChangedRef.current?.({ ...transformRef.current }, checkpoint);
  }, [applyTransform]);

  // ---------------------------------------------------------------------------
  // Crop
  // ---------------------------------------------------------------------------
  const startCrop = useCallback(async () => {
    const canvas = fabricRef.current;
    if (!canvas || isCropping) return;

    resetZoom();

    const generation = ++cropGenerationRef.current;
    const { Rect } = await import("fabric");
    if (canvas !== fabricRef.current || generation !== cropGenerationRef.current) return;
    const w = canvas.getWidth();
    const h = canvas.getHeight();
    const inset = Math.min(w, h) * 0.05;

    const rect = new Rect({
      left: inset,
      top: inset,
      width: w - inset * 2,
      height: h - inset * 2,
      fill: "rgba(0,0,0,0)",
      stroke: "#ffffff",
      strokeWidth: 1.5,
      strokeDashArray: [6, 3],
      selectable: true,
      hasControls: true,
      hasBorders: true,
      lockRotation: true,
      transparentCorners: false,
      cornerColor: "#ffffff",
      cornerSize: 8,
      borderColor: "#ffffff",
    });

    canvas.selection = true;
    canvas.add(rect);
    canvas.setActiveObject(rect);
    cropRectRef.current = rect;
    canvas.renderAll();
    setIsCropping(true);
  }, [isCropping, resetZoom]);

  const confirmCrop = useCallback(async (isCurrent: () => boolean = () => true): Promise<string | null> => {
    const canvas = fabricRef.current;
    const rect = cropRectRef.current;
    const bgImg = bgImageRef.current;
    if (!canvas || !rect || !bgImg) return null;
    const generation = ++cropGenerationRef.current;

    // Remove crop rect and force a clean render to clear selection handles (Bug 2)
    canvas.remove(rect);
    canvas.discardActiveObject();
    canvas.renderAll();
    canvas.selection = false;
    cropRectRef.current = null;

    // Use getBoundingRect() for reliable canvas-space positions — accounts for
    // all Fabric transforms (origin, scale, position) without manual math.
    const imgBounds = bgImg.getBoundingRect();
    const rectBounds = rect.getBoundingRect();

    // Get the image's natural pixel dimensions from the source element
    const source = sourceImageRef.current?.getElement() as HTMLImageElement | undefined;
    if (!source) return null;
    const srcEl = transformedSource(source, transformRef.current);
    const imgNatW = srcEl.width;
    const imgNatH = srcEl.height;

    // Map crop rect from canvas space to image natural-pixel space
    let srcX = ((rectBounds.left - imgBounds.left) / imgBounds.width) * imgNatW;
    let srcY = ((rectBounds.top - imgBounds.top) / imgBounds.height) * imgNatH;
    let srcW = (rectBounds.width / imgBounds.width) * imgNatW;
    let srcH = (rectBounds.height / imgBounds.height) * imgNatH;

    // Intersect the selection with the full composition, including selections
    // extending past the image's top/left edges.
    const right = Math.min(imgNatW, srcX + srcW);
    const bottom = Math.min(imgNatH, srcY + srcH);
    srcX = Math.max(0, srcX);
    srcY = Math.max(0, srcY);
    srcW = right - srcX;
    srcH = bottom - srcY;

    if (srcW <= 1 || srcH <= 1) {
      setIsCropping(false);
      return null;
    }

    const outW = Math.round(srcW);
    const outH = Math.round(srcH);
    const offscreen = document.createElement("canvas");
    offscreen.width = outW;
    offscreen.height = outH;
    offscreen.getContext("2d")?.drawImage(
      srcEl,
      Math.round(srcX), Math.round(srcY), outW, outH,
      0, 0, outW, outH,
    );

    const dataUrl = offscreen.toDataURL("image/png");
    const { FabricImage } = await import("fabric");
    const newImg = await FabricImage.fromURL(dataUrl, { crossOrigin: "anonymous" });
    if (!isCurrent() || canvas !== fabricRef.current || generation !== cropGenerationRef.current) {
      setIsCropping(false);
      return null;
    }

    // Fit the cropped image into the existing canvas (keep canvas dimensions stable)
    const cW = canvas.getWidth();
    const cH = canvas.getHeight();
    const fitScale = Math.min(cW / outW, cH / outH) * 0.95;
    newImg.set({
      scaleX: fitScale,
      scaleY: fitScale,
      originX: "center",
      originY: "center",
      left: cW / 2,
      top: cH / 2,
      angle: 0,
      flipX: false,
      flipY: false,
    });

    transformRef.current = { rotation: 0, flipX: false, flipY: false, straighten: 0 };
    sourceImageRef.current = newImg;
    setSourceVersion((v) => v + 1);
    bgImageRef.current = newImg;
    canvas.backgroundImage = newImg as unknown as import("fabric").FabricObject;
    canvas.renderAll();
    updateImageBounds();
    setActiveImageUrl(dataUrl);
    setIsCropping(false);
    return dataUrl;
  }, [updateImageBounds]);

  const cancelCrop = useCallback(() => {
    cropGenerationRef.current++;
    const canvas = fabricRef.current;
    if (!canvas) return;
    if (cropRectRef.current) {
      canvas.remove(cropRectRef.current);
      canvas.discardActiveObject();
      cropRectRef.current = null;
    }
    canvas.selection = false;
    canvas.renderAll();
    setIsCropping(false);
  }, []);

  // ---------------------------------------------------------------------------
  // Imperative image loader — called after AI operations (e.g. background
  // removal) that return a new URL to replace the current canvas image.
  // Mirrors the prop-driven useEffect but works on demand without waiting
  // for React to re-render with a new imageUrl prop.
  // ---------------------------------------------------------------------------
  const loadImageUrl = useCallback(async (url: string, isCurrent: () => boolean = () => true) => {
    const canvas = fabricRef.current;
    if (!canvas) return false;
    const generation = ++loadGenerationRef.current;

    const { FabricImage } = await import("fabric");
    const img = await FabricImage.fromURL(url, { crossOrigin: "anonymous" });
    if (!isCurrent() || generation !== loadGenerationRef.current || canvas !== fabricRef.current) return false;

    const w = canvas.getWidth();
    const h = canvas.getHeight();
    const size = transformedDimensions(img.width ?? w, img.height ?? h, transformRef.current);
    const scale = Math.min(w / size.width, h / size.height) * 0.95;
    const { rotation, flipX, flipY, straighten } = transformRef.current;

    img.set({
      scaleX: scale,
      scaleY: scale,
      originX: "center",
      originY: "center",
      left: w / 2,
      top: h / 2,
      angle: rotation + straighten,
      flipX,
      flipY,
    });

    sourceImageRef.current = img;
    setSourceVersion((v) => v + 1);
    bgImageRef.current = img;
    canvas.backgroundImage = img as unknown as import("fabric").FabricObject;
    canvas.renderAll();
    updateImageBounds();
    setActiveImageUrl(url);
    return true;
  }, [updateImageBounds]);

  // ---------------------------------------------------------------------------
  // Resize canvas + re-fit background image
  // ---------------------------------------------------------------------------
  const resizeCanvas = useCallback(async (newW: number, newH: number, isCurrent: () => boolean = () => true): Promise<string | null> => {
    const canvas = fabricRef.current;
    const img = bgImageRef.current;
    if (!canvas || !img) return null;

    // Pure center crop at native pixel resolution — no resampling
    const source = sourceImageRef.current?.getElement() as HTMLImageElement | undefined;
    if (!source) return null;
    const srcEl = transformedSource(source, transformRef.current);
    const natW = srcEl.width;
    const natH = srcEl.height;

    // Clamp target to source dimensions (can't crop to larger than source)
    const outW = Math.min(newW, natW);
    const outH = Math.min(newH, natH);

    // Take center outW × outH pixels at native resolution
    const srcX = (natW - outW) / 2;
    const srcY = (natH - outH) / 2;

    const offscreen = document.createElement("canvas");
    offscreen.width = outW;
    offscreen.height = outH;
    offscreen.getContext("2d")?.drawImage(
      srcEl,
      srcX, srcY, outW, outH,
      0, 0, outW, outH,
    );

    const dataUrl = offscreen.toDataURL("image/png");
    const { FabricImage } = await import("fabric");
    const newImg = await FabricImage.fromURL(dataUrl, { crossOrigin: "anonymous" });
    if (!isCurrent() || canvas !== fabricRef.current) return null;

    // Fit the cropped image into the existing Fabric canvas (don't resize canvas element)
    const cW = canvas.getWidth();
    const cH = canvas.getHeight();
    const fitScale = Math.min(cW / outW, cH / outH) * 0.95;
    newImg.set({
      scaleX: fitScale,
      scaleY: fitScale,
      originX: "center",
      originY: "center",
      left: cW / 2,
      top: cH / 2,
      angle: 0,
      flipX: false,
      flipY: false,
    });

    transformRef.current = { rotation: 0, flipX: false, flipY: false, straighten: 0 };
    sourceImageRef.current = newImg;
    setSourceVersion((v) => v + 1);
    bgImageRef.current = newImg;
    canvas.backgroundImage = newImg as unknown as import("fabric").FabricObject;
    canvas.renderAll();
    updateImageBounds();
    setActiveImageUrl(dataUrl);
    return dataUrl;
  }, [updateImageBounds]);

  // ---------------------------------------------------------------------------
  // Heal brush — free drawing in red; export mask aligned to image pixels
  // ---------------------------------------------------------------------------
  const enableHealBrush = useCallback(async () => {
    const canvas = fabricRef.current;
    if (!canvas || !bgImageRef.current) return;

    const generation = ++brushGenerationRef.current;
    const { PencilBrush } = await import("fabric");
    if (canvas !== fabricRef.current || generation !== brushGenerationRef.current) return;

    canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    canvas.requestRenderAll();
    setZoom(1);
    setViewportTransform([1, 0, 0, 1, 0, 0]);

    if (healPathHandlerRef.current) {
      canvas.off("path:created", healPathHandlerRef.current);
      healPathHandlerRef.current = null;
    }
    const onPathCreated = (e: { path: FabricObject }) => {
      healPathsRef.current = [...healPathsRef.current, e.path];
      onMasksChangedRef.current?.({ heal: healPathsRef.current, eraser: eraserPathsRef.current, blur: blurPathsRef.current });
    };
    canvas.on("path:created", onPathCreated);
    healPathHandlerRef.current = onPathCreated;

    const brush = new PencilBrush(canvas);
    brush.color = "rgba(255, 0, 0, 0.5)";
    brush.width = brushSizesRef.current.heal;
    activeBrushRef.current = "heal";
    canvas.freeDrawingBrush = brush;
    canvas.isDrawingMode = true;
    updateBrushCursor();
    canvas.selection = false;
    canvas.discardActiveObject();
    canvas.requestRenderAll();
    setIsHealBrush(true);
  }, [updateBrushCursor]);

  const disableHealBrush = useCallback(() => {
    brushGenerationRef.current++;
    const canvas = fabricRef.current;
    if (!canvas) return;

    canvas.isDrawingMode = false;
    activeBrushRef.current = null;
    updateBrushCursor();
    if (healPathHandlerRef.current) {
      canvas.off("path:created", healPathHandlerRef.current);
      healPathHandlerRef.current = null;
    }
    for (const p of healPathsRef.current) {
      try {
        canvas.remove(p);
      } catch {
        /* ignore */
      }
    }
    healPathsRef.current = [];
    onMasksChangedRef.current?.({ heal: healPathsRef.current, eraser: eraserPathsRef.current, blur: blurPathsRef.current }, false);
    canvas.requestRenderAll();
    setIsHealBrush(false);
  }, [updateBrushCursor]);

  // ---------------------------------------------------------------------------
  // Eraser brush — same as heal brush but white stroke; same mask export format
  // ---------------------------------------------------------------------------
  const enableEraserBrush = useCallback(async () => {
    const canvas = fabricRef.current;
    if (!canvas || !bgImageRef.current) return;

    const generation = ++brushGenerationRef.current;
    const { PencilBrush } = await import("fabric");
    if (canvas !== fabricRef.current || generation !== brushGenerationRef.current) return;

    canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    canvas.requestRenderAll();
    setZoom(1);
    setViewportTransform([1, 0, 0, 1, 0, 0]);

    if (eraserPathHandlerRef.current) {
      canvas.off("path:created", eraserPathHandlerRef.current);
      eraserPathHandlerRef.current = null;
    }
    const onPathCreated = (e: { path: FabricObject }) => {
      eraserPathsRef.current = [...eraserPathsRef.current, e.path];
      onMasksChangedRef.current?.({ heal: healPathsRef.current, eraser: eraserPathsRef.current, blur: blurPathsRef.current });
    };
    canvas.on("path:created", onPathCreated);
    eraserPathHandlerRef.current = onPathCreated;

    const brush = new PencilBrush(canvas);
    brush.color = "rgba(255, 255, 255, 0.7)";
    brush.width = brushSizesRef.current.eraser;
    activeBrushRef.current = "eraser";
    canvas.freeDrawingBrush = brush;
    canvas.isDrawingMode = true;
    updateBrushCursor();
    canvas.selection = false;
    canvas.discardActiveObject();
    canvas.requestRenderAll();
  }, [updateBrushCursor]);

  const disableEraserBrush = useCallback(() => {
    brushGenerationRef.current++;
    const canvas = fabricRef.current;
    if (!canvas) return;

    canvas.isDrawingMode = false;
    activeBrushRef.current = null;
    updateBrushCursor();
    if (eraserPathHandlerRef.current) {
      canvas.off("path:created", eraserPathHandlerRef.current);
      eraserPathHandlerRef.current = null;
    }
    for (const p of eraserPathsRef.current) {
      try { canvas.remove(p); } catch { /* ignore */ }
    }
    eraserPathsRef.current = [];
    onMasksChangedRef.current?.({ heal: healPathsRef.current, eraser: eraserPathsRef.current, blur: blurPathsRef.current }, false);
    canvas.requestRenderAll();
  }, [updateBrushCursor]);

  const exportEraserMask = useCallback(async (): Promise<string> => {
    const canvas = fabricRef.current;
    const img = bgImageRef.current;
    if (!canvas || !img) throw new Error("Canvas not ready");
    const paths = eraserPathsRef.current;
    if (paths.length === 0) throw new Error("Paint over the area to erase first");

    const nw = sourceImageRef.current?.width ?? img.width;
    const nh = sourceImageRef.current?.height ?? img.height;
    const cw = canvas.getWidth();
    const ch = canvas.getHeight();
    const br = img.getBoundingRect();

    const { StaticCanvas } = await import("fabric");
    const el = document.createElement("canvas");
    el.width = cw;
    el.height = ch;
    const tmp = new StaticCanvas(el, { width: cw, height: ch, backgroundColor: "#000000" });

    for (const p of paths) {
      const cloned = await p.clone();
      cloned.set({ stroke: "#ffffff", fill: "", opacity: 1 });
      tmp.add(cloned);
    }
    tmp.renderAll();
    const fullMaskDataUrl = tmp.toDataURL({ format: "png", multiplier: 1 });
    tmp.dispose();

    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = nw;
    maskCanvas.height = nh;
    const ctx = maskCanvas.getContext("2d");
    if (!ctx) throw new Error("Could not get 2d context");
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, nw, nh);

    const bitmap = new Image();
    await new Promise<void>((resolve, reject) => {
      bitmap.onload = () => resolve();
      bitmap.onerror = () => reject(new Error("Failed to load eraser mask bitmap"));
      bitmap.src = fullMaskDataUrl;
    });
    drawSourceMask(ctx, bitmap, br, nw, nh, transformRef.current);

    const dataUrl = maskCanvas.toDataURL("image/png");
    const comma = dataUrl.indexOf(",");
    return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  }, []);

  const enableBlurBrush = useCallback(async () => {
    const canvas = fabricRef.current;
    if (!canvas || !bgImageRef.current) return;

    const generation = ++brushGenerationRef.current;
    const { PencilBrush } = await import("fabric");
    if (canvas !== fabricRef.current || generation !== brushGenerationRef.current) return;

    canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    canvas.requestRenderAll();
    setZoom(1);
    setViewportTransform([1, 0, 0, 1, 0, 0]);

    if (blurPathHandlerRef.current) {
      canvas.off("path:created", blurPathHandlerRef.current);
      blurPathHandlerRef.current = null;
    }
    const onPathCreated = (e: { path: FabricObject }) => {
      blurPathsRef.current = [...blurPathsRef.current, e.path];
      onMasksChangedRef.current?.({ heal: healPathsRef.current, eraser: eraserPathsRef.current, blur: blurPathsRef.current });
    };
    canvas.on("path:created", onPathCreated);
    blurPathHandlerRef.current = onPathCreated;

    const brush = new PencilBrush(canvas);
    brush.color = "rgba(255, 200, 50, 0.7)";
    brush.width = brushSizesRef.current.blur;
    activeBrushRef.current = "blur";
    canvas.freeDrawingBrush = brush;
    canvas.isDrawingMode = true;
    updateBrushCursor();
    canvas.selection = false;
    canvas.discardActiveObject();
    canvas.requestRenderAll();
  }, [updateBrushCursor]);

  const disableBlurBrush = useCallback(() => {
    brushGenerationRef.current++;
    const canvas = fabricRef.current;
    if (!canvas) return;

    canvas.isDrawingMode = false;
    activeBrushRef.current = null;
    updateBrushCursor();
    if (blurPathHandlerRef.current) {
      canvas.off("path:created", blurPathHandlerRef.current);
      blurPathHandlerRef.current = null;
    }
    for (const p of blurPathsRef.current) {
      try { canvas.remove(p); } catch { /* ignore */ }
    }
    blurPathsRef.current = [];
    onMasksChangedRef.current?.({ heal: healPathsRef.current, eraser: eraserPathsRef.current, blur: blurPathsRef.current }, false);
    canvas.requestRenderAll();
  }, [updateBrushCursor]);

  const exportBlurMask = useCallback(async (): Promise<string> => {
    const canvas = fabricRef.current;
    const img = bgImageRef.current;
    if (!canvas || !img) throw new Error("Canvas not ready");
    const paths = blurPathsRef.current;
    if (paths.length === 0) throw new Error("Paint over the area to blur first");

    const nw = sourceImageRef.current?.width ?? img.width;
    const nh = sourceImageRef.current?.height ?? img.height;
    const cw = canvas.getWidth();
    const ch = canvas.getHeight();
    const br = img.getBoundingRect();

    const { StaticCanvas } = await import("fabric");
    const el = document.createElement("canvas");
    el.width = cw;
    el.height = ch;
    const tmp = new StaticCanvas(el, { width: cw, height: ch, backgroundColor: "#000000" });

    for (const p of paths) {
      const cloned = await p.clone();
      cloned.set({ stroke: "#ffffff", fill: "", opacity: 1 });
      tmp.add(cloned);
    }
    tmp.renderAll();
    const fullMaskDataUrl = tmp.toDataURL({ format: "png", multiplier: 1 });
    tmp.dispose();

    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = nw;
    maskCanvas.height = nh;
    const ctx = maskCanvas.getContext("2d");
    if (!ctx) throw new Error("Could not get 2d context");
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, nw, nh);

    const bitmap = new Image();
    await new Promise<void>((resolve, reject) => {
      bitmap.onload = () => resolve();
      bitmap.onerror = () => reject(new Error("Failed to load blur mask bitmap"));
      bitmap.src = fullMaskDataUrl;
    });
    drawSourceMask(ctx, bitmap, br, nw, nh, transformRef.current);

    const dataUrl = maskCanvas.toDataURL("image/png");
    const comma = dataUrl.indexOf(",");
    return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  }, []);

  const exportMask = useCallback(async (): Promise<string> => {
    const canvas = fabricRef.current;
    const img = bgImageRef.current;
    if (!canvas || !img) {
      throw new Error("Canvas not ready");
    }
    const paths = healPathsRef.current;
    if (paths.length === 0) {
      throw new Error("Paint over the area to heal first");
    }

    const nw = sourceImageRef.current?.width ?? img.width;
    const nh = sourceImageRef.current?.height ?? img.height;
    const cw = canvas.getWidth();
    const ch = canvas.getHeight();
    const br = img.getBoundingRect();

    const { StaticCanvas } = await import("fabric");
    const el = document.createElement("canvas");
    el.width = cw;
    el.height = ch;
    const tmp = new StaticCanvas(el, {
      width: cw,
      height: ch,
      backgroundColor: "#000000",
    });

    for (const p of paths) {
      const cloned = await p.clone();
      cloned.set({ stroke: "#ffffff", fill: "", opacity: 1 });
      tmp.add(cloned);
    }
    tmp.renderAll();
    const fullMaskDataUrl = tmp.toDataURL({ format: "png", multiplier: 1 });
    tmp.dispose();

    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = nw;
    maskCanvas.height = nh;
    const ctx = maskCanvas.getContext("2d");
    if (!ctx) {
      throw new Error("Could not get 2d context");
    }
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, nw, nh);

    const bitmap = new Image();
    await new Promise<void>((resolve, reject) => {
      bitmap.onload = () => resolve();
      bitmap.onerror = () => reject(new Error("Failed to load mask bitmap"));
      bitmap.src = fullMaskDataUrl;
    });
    drawSourceMask(ctx, bitmap, br, nw, nh, transformRef.current);

    const dataUrl = maskCanvas.toDataURL("image/png");
    const comma = dataUrl.indexOf(",");
    return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  }, []);


  const restoreMasks = useCallback((masks?: CanvasMasks) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const previous = [...healPathsRef.current, ...eraserPathsRef.current, ...blurPathsRef.current];
    previous.forEach((path) => canvas.remove(path));
    healPathsRef.current = masks?.heal ?? [];
    eraserPathsRef.current = masks?.eraser ?? [];
    blurPathsRef.current = masks?.blur ?? [];
    [...healPathsRef.current, ...eraserPathsRef.current, ...blurPathsRef.current].forEach((path) => canvas.add(path));
    canvas.requestRenderAll();
  }, []);

  return {
    canvasRef,
    restoreMasks,
    previewError,
    navigatorImage: displayedNavigator,
    onOriginalImageLoad,
    centerNavigator,
    containerRef,
    zoom,
    showBefore,
    isCropping,
    isHealBrush,
    imageBounds,
    zoomIn,
    zoomOut,
    resetZoom,
    toggleBefore,
    rotateCW,
    rotateCCW,
    flipH,
    flipV,
    straightenImage,
    startCrop,
    confirmCrop,
    cancelCrop,
    resizeCanvas,
    loadImageUrl,
    activeImageUrl,
    viewportTransform,
    brushSizes,
    setBrushSize,
    enableHealBrush,
    disableHealBrush,
    exportMask,
    enableEraserBrush,
    disableEraserBrush,
    exportEraserMask,
    enableBlurBrush,
    disableBlurBrush,
    exportBlurMask,
    getTransformSnapshot: () => ({ ...transformRef.current }),
    getPixelDimensions: () => ({ width: sourceImageRef.current?.width ?? null, height: sourceImageRef.current?.height ?? null }),
  };
}
