"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useEditor } from "@/hooks/useEditor";
import { useCanvas } from "@/hooks/useCanvas";
import type { ImageRecord } from "@/types/image";
import { parseVersionAdjustments } from "@/lib/editor-state";
import { renderEditorPayload } from "@/lib/interactive-image-preview";
import { probeImageDimensions } from "@/lib/probe-image-dimensions";
import { rememberVisitedPage } from "@/lib/last-visited-page";
import ReturnToPreviousPage from "@/components/shared/ReturnToPreviousPage";

import Toolbar from "@/components/editor/Toolbar";
import AdjustmentPanel from "@/components/editor/AdjustmentPanel";
import Canvas from "@/components/editor/Canvas";
import ImageNavigator from "@/components/editor/ImageNavigator";
import { EditorPreviewProvider } from "@/components/editor/EditorPreviewContext";
import EditorErrorBoundary from "@/components/shared/EditorErrorBoundary";
import { LoadingOverlay } from "@/components/shared/LoadingSpinner";
import { CHAT_PANEL_WIDTH_PX } from "@/constants/chat-panel";
import { PANEL_HEADER, PANEL_TITLE } from "@/lib/panel-chrome";

const ChatPanel = dynamic(() => import("@/components/editor/ChatPanel"), {
  ssr: false,
  loading: () => (
    <div
      className="flex flex-col shrink-0 h-full min-w-0 overflow-hidden bg-[#121212] border-l border-[#212121] rounded-l-2xl"
      style={{ width: CHAT_PANEL_WIDTH_PX }}
      aria-busy
      aria-label="Loading chat"
    >
      <div className={`${PANEL_HEADER} px-8`}>
        <span className={PANEL_TITLE}>Chat</span>
      </div>
    </div>
  ),
});

const ExportModal = dynamic(() => import("@/components/editor/ExportModal"), {
  ssr: false,
});

export default function EditorApp() {
  const searchParams = useSearchParams();
  const imageId = searchParams.get("imageId") ?? undefined;
  return <EditorWorkspace key={imageId ?? "empty"} imageId={imageId} />;
}

function EditorWorkspace({ imageId }: { imageId?: string }) {
  const [image, setImage] = useState<ImageRecord | null>(null);
  const [imageMissing, setImageMissing] = useState(false);
  const [loadingImage, setLoadingImage] = useState(!!imageId);
  const [showExport, setShowExport] = useState(false);
  const savePreviewRef = useRef<(() => Promise<string | null>) | null>(null);
  const saveEditorStateRef = useRef<(() => Promise<void>) | null>(null);
  const canvasHydratedRef = useRef(false);

  useEffect(() => {
    if (!imageId) return;
    let cancelled = false;
    canvasHydratedRef.current = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setLoadingImage(true);
      setImage(null);
      setImageMissing(false);
    });
    fetch(`/api/images/${encodeURIComponent(imageId)}`)
      .then((res) => {
        if (res.status === 404) {
          if (!cancelled) setImageMissing(true);
          return {};
        }
        if (!res.ok) throw new Error(`Could not load image (${res.status})`);
        return res.json();
      })
      .then((data: { image?: ImageRecord }) => {
        if (!cancelled && data.image) {
          setImage(data.image);
          rememberVisitedPage(`${window.location.pathname}${window.location.search}${window.location.hash}`);
        }
      })
      .catch(console.error)
      .finally(() => { if (!cancelled) setLoadingImage(false); });
    return () => { cancelled = true; };
  }, [imageId]);

  const {
    adjustments,
    editorState,
    commitState,
    createEditGuard,
    createChatEditGuard,
    beginOperation,
    prepareExportState,
    previewAdjustment,
    updateAdjustment,
    patchAdjustments,
    undo,
    redo,
    canUndo,
    canRedo,
    isDirty,
    justSaved,
    saveVersion,
    restorePersistedState,
    versionLoaded,
  } = useEditor(imageId, { canAutoSave: () => canvasHydratedRef.current });

  const savedTransform = editorState.transform;
  const baseImageUrl = editorState.workingImageUrl ?? image?.originalUrl ?? null;
  const imageBase64 = baseImageUrl?.startsWith("data:") ? baseImageUrl.split(",")[1] : null;
  const canvasDimensions = {
    width: editorState.workingWidth ?? image?.width ?? undefined,
    height: editorState.workingHeight ?? image?.height ?? undefined,
  };
  const restoredMaskTool = editorState.masks?.heal.length ? "heal"
    : editorState.masks?.eraser.length ? "eraser"
    : editorState.masks?.blur.length ? "blur" : null;
  const canvasSourceUrl = versionLoaded && !loadingImage ? baseImageUrl : null;
  const {
    canvasRef,
    containerRef,
    zoom,
    showBefore,
    isCropping,
    zoomIn,
    zoomOut,
    resetZoom,
    toggleBefore,
    rotateCW,
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
    restoreMasks,
    getTransformSnapshot,
    getPixelDimensions,
    previewError,
    navigatorImage,
    onOriginalImageLoad,
    viewportTransform,
    centerNavigator,
  } = useCanvas(
    canvasSourceUrl, adjustments, savedTransform,
    (masks, checkpoint) => { commitState({ masks }, checkpoint); },
    (transform, checkpoint) => { commitState({ transform }, checkpoint); },
  );

  const croppingRef = useRef(isCropping);
  croppingRef.current = isCropping;

  useLayoutEffect(() => {
    restoreMasks(editorState.masks);
  }, [editorState.masks, restoreMasks]);

  useEffect(() => {
    canvasHydratedRef.current = versionLoaded && !loadingImage && !!activeImageUrl;
  }, [versionLoaded, loadingImage, activeImageUrl]);

  useEffect(() => {
    saveEditorStateRef.current = async () => { await saveVersion(true); };
  }, [saveVersion]);

  const handleRestoreHistory = useCallback(async (raw: unknown) => {
    const finishOperation = beginOperation();
    try {
      const restored = parseVersionAdjustments(raw);
      const isCurrent = createEditGuard();
      const url = restored.workingImageUrl ?? image?.originalUrl;
      if (!url || !(await loadImageUrl(url, isCurrent)) || !isCurrent()) return;
      restorePersistedState(restored);
    } finally { finishOperation(); }
  }, [beginOperation, restorePersistedState, createEditGuard, image?.originalUrl, loadImageUrl]);

  const reloadCanvas = useCallback(async (url: string, isCurrent: () => boolean = () => true) => {
    if (!isCurrent()) return false;
    const dims = await probeImageDimensions(url);
    if (!isCurrent()) return false;
    if (!dims) throw new Error("Could not load the edited image");
    if (!(await loadImageUrl(url, isCurrent))) return false;
    if (!isCurrent()) return false;
    commitState({
      workingImageUrl: url,
      workingWidth: dims.width,
      workingHeight: dims.height,
      masks: undefined,
    });
    return true;
  }, [loadImageUrl, commitState]);

  const handleToggleCrop = useCallback(() => {
    if (isCropping) cancelCrop();
    else void startCrop();
  }, [isCropping, cancelCrop, startCrop]);

  const commitPixels = useCallback((dataUrl: string | null, isCurrent: () => boolean) => {
    if (!dataUrl || !isCurrent()) return;
    const dims = getPixelDimensions();
    if (!dims.width || !dims.height) return;
    commitState({
      workingImageUrl: dataUrl,
      workingWidth: dims.width,
      workingHeight: dims.height,
      transform: getTransformSnapshot(),
      masks: undefined,
    });
  }, [commitState, getTransformSnapshot, getPixelDimensions]);

  const handleConfirmCrop = useCallback(async () => {
    const finishOperation = beginOperation();
    try {
      const isCurrent = createEditGuard();
      commitPixels(await confirmCrop(isCurrent), isCurrent);
    } finally { finishOperation(); }
  }, [beginOperation, createEditGuard, confirmCrop, commitPixels]);

  const handleResize = useCallback(async (width: number, height: number) => {
    const finishOperation = beginOperation();
    try {
      const isCurrent = createEditGuard();
      commitPixels(await resizeCanvas(width, height, isCurrent), isCurrent);
    } finally { finishOperation(); }
  }, [beginOperation, createEditGuard, resizeCanvas, commitPixels]);

  const handlePreviewAdjustment = previewAdjustment;
  const handleCommitAdjustment = updateAdjustment;
  const handlePatchAdjustments = patchAdjustments;
  const handleRotateCW = rotateCW;

  const straighteningRef = useRef(false);
  const handleStraightenPreview = useCallback((degrees: number) => {
    if (degrees === getTransformSnapshot().straighten) return;
    straightenImage(degrees, !straighteningRef.current);
    straighteningRef.current = true;
  }, [straightenImage, getTransformSnapshot]);
  const handleStraightenCommit = useCallback((degrees: number) => {
    handleStraightenPreview(degrees);
    straighteningRef.current = false;
  }, [handleStraightenPreview]);

  const handleUndo = useCallback(() => {
    straighteningRef.current = false;
    cancelCrop();
    undo();
  }, [cancelCrop, undo]);
  const handleRedo = useCallback(() => {
    straighteningRef.current = false;
    cancelCrop();
    redo();
  }, [cancelCrop, redo]);

  const getPreviewPayload = useCallback(() => ({
    adjustments,
    originalUrl: image?.originalUrl ?? null,
    storedPreviewUrl: image?.previewUrl ?? null,
    baseImageUrl,
    imageBase64,
    transform: savedTransform,
  }), [adjustments, image?.originalUrl, image?.previewUrl, baseImageUrl, imageBase64, savedTransform]);

  useEffect(() => {
    if (!canvasHydratedRef.current) return;
    const timer = setTimeout(() => {
      void saveVersion();
      void savePreviewRef.current?.();
    }, 2000);
    return () => clearTimeout(timer);
  }, [editorState, saveVersion, versionLoaded, loadingImage]);

  if (imageMissing) return <ReturnToPreviousPage />;

  return (
    <EditorPreviewProvider
      imageId={imageId}
      getPayload={getPreviewPayload}
      savePreviewRef={savePreviewRef}
      saveEditorStateRef={saveEditorStateRef}
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
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={handleUndo}
          onRedo={handleRedo}
          isDirty={isDirty}
          justSaved={justSaved}
          exportReady={versionLoaded && !loadingImage && !!baseImageUrl}
          onExport={() => setShowExport(true)}
        />

        <div className="flex flex-1 min-h-0 min-w-0 overflow-hidden">
          <AdjustmentPanel
            adjustments={adjustments}
            onPreview={handlePreviewAdjustment}
            onCommit={handleCommitAdjustment}
            onPatch={handlePatchAdjustments}
            imageId={imageId}
            imageUrl={image?.originalUrl ?? null}
            imageWidth={image?.width ?? undefined}
            imageHeight={image?.height ?? undefined}
            canvasWidth={canvasDimensions?.width}
            canvasHeight={canvasDimensions?.height}
            isCropping={isCropping}
            onToggleCrop={handleToggleCrop}
            onRotateCW={handleRotateCW}
            onStraighten={handleStraightenPreview}
            onStraightenCommit={handleStraightenCommit}
            straightenDegrees={savedTransform.straighten}
            onResize={handleResize}
            onReloadCanvas={reloadCanvas}
            createEditGuard={createEditGuard}
            beginOperation={beginOperation}
            restoredMaskTool={restoredMaskTool}
            canvasImageUrl={baseImageUrl}
            enableHealBrush={enableHealBrush}
            disableHealBrush={disableHealBrush}
            exportHealMask={exportMask}
            enableEraserBrush={enableEraserBrush}
            disableEraserBrush={disableEraserBrush}
            exportEraserMask={exportEraserMask}
            enableBlurBrush={enableBlurBrush}
            disableBlurBrush={disableBlurBrush}
            exportBlurMask={exportBlurMask}
            onRestoreHistory={handleRestoreHistory}
          />

          <EditorErrorBoundary label="canvas">
            <div className="relative flex flex-1 min-h-0 min-w-0">
              <Canvas
                canvasRef={canvasRef}
                containerRef={containerRef}
                originalImageUrl={image?.originalUrl ?? null}
                onOriginalImageLoad={onOriginalImageLoad}
                showBefore={showBefore}
                viewportTransform={viewportTransform}
                isCropping={isCropping}
                onConfirmCrop={handleConfirmCrop}
                onCancelCrop={cancelCrop}
              />
              {navigatorImage && !loadingImage && (
                <ImageNavigator image={navigatorImage} viewport={viewportTransform} onCenter={centerNavigator} />
              )}
              {previewError && (
                <p role="status" className="absolute top-3 left-1/2 -translate-x-1/2 text-xs text-white bg-black/70 px-3 py-2 rounded-md pointer-events-none">
                  {previewError}
                </p>
              )}
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
              createEditGuard={createEditGuard}
              createChatEditGuard={createChatEditGuard}
              beginOperation={beginOperation}
              onUndo={handleUndo}
              imageId={imageId}
              canvasImageUrl={baseImageUrl}
            />
          </EditorErrorBoundary>
        </div>

        {showExport && (
          <ExportModal
            open={showExport}
            onClose={() => setShowExport(false)}
            imageId={imageId}
            filename={image?.filename}
            prepareExport={async () => {
              const latest = await prepareExportState();
              if (croppingRef.current) throw new Error("Confirm or cancel your crop before exporting.");
              return renderEditorPayload({
                adjustments: latest.sliders,
                originalUrl: image?.originalUrl ?? null,
                storedPreviewUrl: image?.previewUrl ?? null,
                baseImageUrl: latest.workingImageUrl ?? image?.originalUrl ?? null,
                imageBase64: null,
                transform: latest.transform,
              }, true);
            }}
          />
        )}
      </div>
    </EditorPreviewProvider>
  );
}
