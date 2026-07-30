"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useEditor } from "@/hooks/useEditor";
import { useCanvas } from "@/hooks/useCanvas";
import type { ImageRecord } from "@/types/image";
import { isStoredPreviewUrl } from "@/lib/resolve-preview-source";
import type { PreviewPayload } from "@/lib/preview-request";
import type { AdjustmentKey } from "@/constants/adjustments";

function stripDataUrlBase64(dataUrl: string): string {
  const comma = dataUrl.indexOf(",");
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}

import Toolbar from "@/components/editor/Toolbar";
import AdjustmentPanel from "@/components/editor/AdjustmentPanel";
import Canvas from "@/components/editor/Canvas";
import ChatPanel from "@/components/editor/ChatPanel";
import ExportModal from "@/components/editor/ExportModal";
import { EditorPreviewProvider } from "@/components/editor/EditorPreviewContext";
import EditorErrorBoundary from "@/components/shared/EditorErrorBoundary";
import { LoadingOverlay } from "@/components/shared/LoadingSpinner";

export default function EditorApp() {
  const searchParams = useSearchParams();
  const imageId = searchParams.get("imageId") ?? undefined;

  const [image, setImage] = useState<ImageRecord | null>(null);
  const [loadingImage, setLoadingImage] = useState(!!imageId);
  const [showExport, setShowExport] = useState(false);
  const [baseImageUrl, setBaseImageUrl] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const savePreviewRef = useRef<(() => Promise<string | null>) | null>(null);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoRedoOrderRef = useRef<Array<"canvas" | "adjustments">>([]);
  const previewPixelsRef = useRef<Pick<PreviewPayload, "baseImageUrl" | "imageBase64">>({
    baseImageUrl: null,
    imageBase64: null,
  });
  const [transformVersion, setTransformVersion] = useState(0);

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

  useEffect(() => {
    if (image?.originalUrl) {
      setBaseImageUrl(image.originalUrl);
      setImageBase64(null);
      previewPixelsRef.current = {
        baseImageUrl: image.originalUrl,
        imageBase64: null,
      };
    }
  }, [image?.id, image?.originalUrl]);

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

  const canvasSourceUrl = baseImageUrl ?? image?.originalUrl ?? null;

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
    redoLastCanvas,
    canUndoCanvas,
    canRedoCanvas,
    getTransformSnapshot,
  } = useCanvas(canvasSourceUrl, adjustments);

  useEffect(() => {
    if (!activeImageUrl) return;
    if (activeImageUrl.startsWith("data:")) {
      const b64 = stripDataUrlBase64(activeImageUrl);
      setImageBase64(b64);
      previewPixelsRef.current.imageBase64 = b64;
      return;
    }
    if (
      activeImageUrl.startsWith("https://") &&
      !isStoredPreviewUrl(activeImageUrl, image?.previewUrl)
    ) {
      setBaseImageUrl(activeImageUrl);
      setImageBase64(null);
      previewPixelsRef.current = {
        baseImageUrl: activeImageUrl,
        imageBase64: null,
      };
    }
  }, [activeImageUrl, image?.previewUrl]);

  const schedulePreviewSave = useCallback(() => {
    if (!imageId) return;
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    previewTimerRef.current = setTimeout(() => {
      void savePreviewRef.current?.();
    }, 2000);
  }, [imageId]);

  const savePreviewNow = useCallback(async () => {
    if (previewTimerRef.current) {
      clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }
    await savePreviewRef.current?.();
  }, []);

  const reloadCanvas = useCallback(
    async (url: string) => {
      undoRedoOrderRef.current = [];
      if (activeImageUrl) {
        pushImageHistory(activeImageUrl, getTransformSnapshot());
      }
      await loadImageUrl(url);
      if (!isStoredPreviewUrl(url, image?.previewUrl)) {
        setBaseImageUrl(url);
        setImageBase64(null);
        previewPixelsRef.current = { baseImageUrl: url, imageBase64: null };
      }
      await savePreviewNow();
    },
    [
      activeImageUrl,
      pushImageHistory,
      getTransformSnapshot,
      loadImageUrl,
      image?.previewUrl,
      savePreviewNow,
    ],
  );

  const handleToggleCrop = useCallback(() => {
    if (isCropping) {
      cancelCrop();
      return;
    }
    void startCrop();
  }, [isCropping, cancelCrop, startCrop]);

  const handleConfirmCrop = useCallback(async () => {
    undoRedoOrderRef.current = [];
    const dataUrl = await confirmCrop();
    if (dataUrl) {
      const b64 = stripDataUrlBase64(dataUrl);
      previewPixelsRef.current.imageBase64 = b64;
      setImageBase64(b64);
    }
    await savePreviewNow();
  }, [confirmCrop, savePreviewNow]);

  const handleResize = useCallback(
    async (newW: number, newH: number) => {
      undoRedoOrderRef.current = [];
      const dataUrl = await resizeCanvas(newW, newH);
      if (dataUrl) {
        const b64 = stripDataUrlBase64(dataUrl);
        previewPixelsRef.current.imageBase64 = b64;
        setImageBase64(b64);
      }
      await savePreviewNow();
    },
    [resizeCanvas, savePreviewNow],
  );

  const bumpTransformPreview = useCallback(() => {
    setTransformVersion((v) => v + 1);
    schedulePreviewSave();
  }, [schedulePreviewSave]);

  const handlePreviewAdjustment = useCallback(
    (key: AdjustmentKey, value: number) => {
      undoRedoOrderRef.current = [];
      previewAdjustment(key, value);
    },
    [previewAdjustment],
  );

  const handlePatchAdjustments = useCallback(
    (patch: Partial<Record<string, number>>) => {
      undoRedoOrderRef.current = [];
      patchAdjustments(patch);
    },
    [patchAdjustments],
  );

  const handleRotateCW = useCallback(() => {
    undoRedoOrderRef.current = [];
    rotateCW();
    bumpTransformPreview();
  }, [rotateCW, bumpTransformPreview]);

  const handleFlipH = useCallback(() => {
    undoRedoOrderRef.current = [];
    flipH();
    bumpTransformPreview();
  }, [flipH, bumpTransformPreview]);

  const handleFlipV = useCallback(() => {
    undoRedoOrderRef.current = [];
    flipV();
    bumpTransformPreview();
  }, [flipV, bumpTransformPreview]);

  const handleStraighten = useCallback(
    (degrees: number) => {
      undoRedoOrderRef.current = [];
      straightenImage(degrees);
      bumpTransformPreview();
    },
    [straightenImage, bumpTransformPreview],
  );

  const handleUndo = useCallback(() => {
    if (canUndoCanvas) {
      void undoLastCanvas();
      undoRedoOrderRef.current.push("canvas");
      return;
    }
    if (canUndo) {
      undo();
      undoRedoOrderRef.current.push("adjustments");
    }
  }, [canUndoCanvas, canUndo, undoLastCanvas, undo]);

  const handleRedo = useCallback(() => {
    const target = undoRedoOrderRef.current.at(-1);
    if (target === "adjustments" && canRedo) {
      redo();
      undoRedoOrderRef.current.pop();
      return;
    }
    if (target === "canvas" && canRedoCanvas) {
      void redoLastCanvas();
      undoRedoOrderRef.current.pop();
      return;
    }
    if (canRedo) {
      redo();
    } else if (canRedoCanvas) {
      void redoLastCanvas();
    }
  }, [canRedo, canRedoCanvas, redo, redoLastCanvas]);

  const handleCanUndo = canUndoCanvas || canUndo;
  const handleCanRedo = canRedoCanvas || canRedo;

  const getPreviewPayload = useCallback(
    () => ({
      adjustments,
      originalUrl: image?.originalUrl ?? null,
      storedPreviewUrl: image?.previewUrl ?? null,
      baseImageUrl: previewPixelsRef.current.baseImageUrl ?? baseImageUrl,
      imageBase64: previewPixelsRef.current.imageBase64 ?? imageBase64,
      transform: getTransformSnapshot(),
    }),
    [
      adjustments,
      image?.originalUrl,
      image?.previewUrl,
      baseImageUrl,
      imageBase64,
      getTransformSnapshot,
    ],
  );

  useEffect(() => {
    schedulePreviewSave();
    return () => {
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    };
  }, [
    schedulePreviewSave,
    adjustments,
    baseImageUrl,
    imageBase64,
    transformVersion,
  ]);

  return (
    <EditorPreviewProvider
      imageId={imageId}
      getPayload={getPreviewPayload}
      savePreviewRef={savePreviewRef}
    >
      <div className="flex flex-col h-screen bg-[#161616] overflow-hidden">
        <Toolbar
          filename={image?.filename}
          zoom={zoom}
          showBefore={showBefore}
          zoomIn={zoomIn}
          zoomOut={zoomOut}
          resetZoom={resetZoom}
          toggleBefore={toggleBefore}
          canUndo={handleCanUndo}
          canRedo={handleCanRedo}
          onUndo={handleUndo}
          onRedo={handleRedo}
          isDirty={isDirty}
          justSaved={justSaved}
          onExport={() => setShowExport(true)}
        />

        <div className="flex flex-1 min-h-0 min-w-0 overflow-hidden">
          <AdjustmentPanel
            adjustments={adjustments}
            onPreview={handlePreviewAdjustment}
            onCommit={updateAdjustment}
            onPatch={handlePatchAdjustments}
            imageId={imageId}
            imageUrl={image?.originalUrl ?? null}
            imageWidth={image?.width ?? undefined}
            imageHeight={image?.height ?? undefined}
            isCropping={isCropping}
            onToggleCrop={handleToggleCrop}
            onRotateCW={handleRotateCW}
            onStraighten={handleStraighten}
            onResize={handleResize}
            onReloadCanvas={reloadCanvas}
            canvasImageUrl={activeImageUrl ?? baseImageUrl ?? image?.originalUrl ?? null}
            enableHealBrush={enableHealBrush}
            disableHealBrush={disableHealBrush}
            exportHealMask={exportMask}
            enableEraserBrush={enableEraserBrush}
            disableEraserBrush={disableEraserBrush}
            exportEraserMask={exportEraserMask}
            enableBlurBrush={enableBlurBrush}
            disableBlurBrush={disableBlurBrush}
            exportBlurMask={exportBlurMask}
            onRestoreHistory={handlePatchAdjustments}
          />

          <EditorErrorBoundary label="canvas">
            <div className="relative flex flex-1 min-h-0 min-w-0">
              <Canvas
                canvasRef={canvasRef}
                containerRef={containerRef}
                imageUrl={canvasSourceUrl}
                adjustments={adjustments}
                imageBounds={imageBounds}
                viewportTransform={viewportTransform}
                isCropping={isCropping}
                onConfirmCrop={handleConfirmCrop}
                onCancelCrop={cancelCrop}
              />
              {loadingImage && (
                <LoadingOverlay
                  className="absolute inset-0 z-10 bg-[#161616]/80 pointer-events-none"
                  message="Loading image"
                  srOnlyMessage
                />
              )}
            </div>
          </EditorErrorBoundary>

          <EditorErrorBoundary label="chat">
            <ChatPanel
              adjustments={adjustments}
              onPatch={handlePatchAdjustments}
              imageId={imageId}
              canvasImageUrl={activeImageUrl ?? baseImageUrl ?? image?.originalUrl ?? null}
            />
          </EditorErrorBoundary>
        </div>

        <ExportModal
          open={showExport}
          onClose={() => setShowExport(false)}
          imageId={imageId}
          filename={image?.filename}
          adjustments={adjustments}
          activeImageUrl={baseImageUrl ?? activeImageUrl}
        />
      </div>
    </EditorPreviewProvider>
  );
}
