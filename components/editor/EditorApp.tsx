"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Adjustments } from "@/hooks/useEditor";
import { useSearchParams } from "next/navigation";
import { useEditor } from "@/hooks/useEditor";
import { useCanvas } from "@/hooks/useCanvas";
import type { ImageRecord } from "@/types/image";

import Toolbar from "@/components/editor/Toolbar";
import AdjustmentPanel from "@/components/editor/AdjustmentPanel";
import Canvas from "@/components/editor/Canvas";
import ChatPanel from "@/components/editor/ChatPanel";
import HistoryPanel from "@/components/editor/HistoryPanel";
import ExportModal from "@/components/editor/ExportModal";
import BottomNav from "@/components/shared/BottomNav";

export default function EditorApp() {
  const searchParams = useSearchParams();
  const imageId = searchParams.get("imageId") ?? undefined;

  const [image, setImage] = useState<ImageRecord | null>(null);
  const [loadingImage, setLoadingImage] = useState(!!imageId);
  const [showHistory, setShowHistory] = useState(false);
  const [showExport, setShowExport] = useState(false);

  useEffect(() => {
    if (!imageId) return;
    setLoadingImage(true);
    fetch(`/api/images/${imageId}`)
      .then((res) => res.json())
      .then((data: { image?: ImageRecord }) => {
        if (data.image) setImage(data.image);
      })
      .catch(console.error)
      .finally(() => setLoadingImage(false));
  }, [imageId]);

  const {
    adjustments,
    previewAdjustment,
    updateAdjustment,
    patchAdjustments,
    undo,
    redo,
    canUndo,
    canRedo,
    isDirty,
    justSaved,
  } = useEditor(imageId);

  const {
    canvasRef,
    containerRef,
    zoom,
    showBefore,
    isCropping,
    imageBounds,
    viewportTransform,
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
    enableHealBrush,
    disableHealBrush,
    exportMask,
    enableEraserBrush,
    disableEraserBrush,
    exportEraserMask,
    enableBlurBrush,
    disableBlurBrush,
    exportBlurMask,
    pushImageHistory,
    undoLastCanvas,
    canUndoCanvas,
    getTransformSnapshot,
  } = useCanvas(image?.previewUrl ?? image?.originalUrl ?? null, adjustments);

  // Wrap loadImageUrl so AI retouch operations (heal, erase, blur, remove bg,
  // gen fill) automatically push canvas undo history before replacing the image
  // and persist the new Cloudinary URL as the image's previewUrl.
  const reloadCanvas = useCallback((url: string) => {
    if (activeImageUrl) pushImageHistory(activeImageUrl, getTransformSnapshot());
    void loadImageUrl(url);
    if (imageId && url.startsWith("https://")) {
      void fetch(`/api/images/${imageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ previewUrl: url }),
      });
    }
  }, [activeImageUrl, pushImageHistory, getTransformSnapshot, loadImageUrl, imageId]);

  // Unified undo: canvas history first, then adjustment slider undo
  const handleUndo = useCallback(() => {
    if (canUndoCanvas) {
      void undoLastCanvas();
    } else {
      undo();
    }
  }, [canUndoCanvas, undoLastCanvas, undo]);

  const handleCanUndo = canUndoCanvas || canUndo;

  // Refs for unmount preview generation — cleanup reads latest values.
  const imageIdRef = useRef(imageId);
  const adjustmentsRef = useRef<Adjustments>(adjustments);
  const activeImageUrlRef = useRef(activeImageUrl);
  imageIdRef.current = imageId;
  adjustmentsRef.current = adjustments;
  activeImageUrlRef.current = activeImageUrl;

  useEffect(() => {
    return () => {
      const id = imageIdRef.current;
      if (!id) return;

      void (async () => {
        try {
          const exportRes = await fetch("/api/images/export", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              imageId: id,
              adjustments: adjustmentsRef.current,
              format: "jpeg",
              quality: 60,
              imageUrl: activeImageUrlRef.current ?? undefined,
            }),
          });
          if (!exportRes.ok) return;

          const blob = await exportRes.blob();
          const formData = new FormData();
          formData.append("file", blob, "preview.jpg");

          await fetch(`/api/images/${id}/preview`, {
            method: "POST",
            body: formData,
          });
        } catch (err) {
          console.error("[EditorApp] Failed to save preview thumbnail:", err);
        }
      })();
    };
  }, []);

  return (
    <div className="flex flex-col h-screen bg-[#0a0a0a] overflow-hidden">
      <Toolbar
        filename={image?.filename}
        zoom={zoom}
        showBefore={showBefore}
        zoomIn={zoomIn}
        zoomOut={zoomOut}
        resetZoom={resetZoom}
        toggleBefore={toggleBefore}
        canUndo={handleCanUndo}
        canRedo={canRedo}
        onUndo={handleUndo}
        onRedo={redo}
        isDirty={isDirty}
        justSaved={justSaved}
        onExport={() => setShowExport(true)}
        onShowHistory={() => setShowHistory(true)}
      />

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <AdjustmentPanel
          adjustments={adjustments}
          onPreview={previewAdjustment}
          onCommit={updateAdjustment}
          onPatch={patchAdjustments}
          imageId={imageId}
          imageUrl={image?.originalUrl ?? null}
          imageWidth={image?.width ?? undefined}
          imageHeight={image?.height ?? undefined}
          onCrop={startCrop}
          onRotateCW={rotateCW}
          onStraighten={straightenImage}
          onResize={resizeCanvas}
          onReloadCanvas={reloadCanvas}
          canvasImageUrl={activeImageUrl ?? image?.originalUrl ?? null}
          enableHealBrush={enableHealBrush}
          disableHealBrush={disableHealBrush}
          exportHealMask={exportMask}
          enableEraserBrush={enableEraserBrush}
          disableEraserBrush={disableEraserBrush}
          exportEraserMask={exportEraserMask}
          enableBlurBrush={enableBlurBrush}
          disableBlurBrush={disableBlurBrush}
          exportBlurMask={exportBlurMask}
        />

        {/* Canvas must always be rendered — never conditionally unmount it.
            If Canvas is hidden while loadingImage=true, the Fabric init effect
            fires with canvasRef.current=null ([] deps = runs once) and Fabric
            never initializes. The placeholder inside Canvas shows while
            imageUrl is null; the image appears once it loads. */}
        <Canvas
          canvasRef={canvasRef}
          containerRef={containerRef}
          imageUrl={image?.originalUrl ?? null}
          adjustments={adjustments}
          imageBounds={imageBounds}
          viewportTransform={viewportTransform}
          isCropping={isCropping}
          onConfirmCrop={confirmCrop}
          onCancelCrop={cancelCrop}
        />

        <ChatPanel
          adjustments={adjustments}
          onPatch={patchAdjustments}
          imageId={imageId}
        />
      </div>

      <BottomNav />

      <HistoryPanel
        open={showHistory}
        onClose={() => setShowHistory(false)}
        imageId={imageId}
        onRestore={patchAdjustments}
      />

      <ExportModal
        open={showExport}
        onClose={() => setShowExport(false)}
        imageId={imageId}
        filename={image?.filename}
        adjustments={adjustments}
        activeImageUrl={activeImageUrl}
      />

    </div>
  );
}
