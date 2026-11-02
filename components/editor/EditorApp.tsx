"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { useSearchParams } from "next/navigation";
import { useEditor } from "@/hooks/useEditor";
import { useCanvas } from "@/hooks/useCanvas";
import { useMobileLayout } from "@/hooks/useMobileLayout";
import { useEditorChatTools } from "@/hooks/useEditorChatTools";
import { editorHistoryRows } from "@/lib/editor-history";
import type { ImageRecord } from "@/types/image";
import { DEFAULT_IMAGE_TRANSFORM, parseVersionAdjustments, serializePersistedEditorState } from "@/lib/editor-state";
import { renderEditorPayload } from "@/lib/interactive-image-preview";
import { probeImageDimensions } from "@/lib/probe-image-dimensions";
import { normalizeAdjustments, type Adjustments } from "@/constants/adjustments";
import { rememberVisitedPage } from "@/lib/last-visited-page";
import ReturnToPreviousPage from "@/components/shared/ReturnToPreviousPage";

import Toolbar from "@/components/editor/Toolbar";
import AdjustmentPanel from "@/components/editor/AdjustmentPanel";
import type { AdjustmentPanelChatControls } from "@/components/editor/AdjustmentPanel";
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
      className="editor-chat-panel flex flex-col shrink-0 h-full min-w-0 overflow-hidden bg-[#121212] border-l border-[#212121] rounded-l-2xl w-[var(--chat-width)]"
      style={{ "--chat-width": `${CHAT_PANEL_WIDTH_PX}px` } as CSSProperties}
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
  const mobileLayout = useMobileLayout();
  const [mobilePanel, setMobilePanel] = useState<"chat" | "adjustments" | null>(null);
  const handlePanelOpen = useCallback((open: boolean) => setMobilePanel(open ? "adjustments" : null), []);
  const [image, setImage] = useState<ImageRecord | null>(null);
  const [imageMissing, setImageMissing] = useState(false);
  const [loadingImage, setLoadingImage] = useState(!!imageId);
  const [showExport, setShowExport] = useState(false);
  const saveEditorStateRef = useRef<(() => Promise<void>) | null>(null);
  const canvasHydratedRef = useRef(false);
  const adjustmentControlsRef = useRef<AdjustmentPanelChatControls | null>(null);

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
    getEditorState,
    getEditorRevision,
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
    getSaveError,
    restorePersistedState,
    versionLoaded,
    historyEntries,
    currentHistoryId,
    savedVersions,
    historyError,
  } = useEditor(imageId, {
    canAutoSave: () => canvasHydratedRef.current,
    renderCover: async (state) => {
      if (!image?.originalUrl || !versionLoaded) throw new Error("The image is still loading.");
      const rendered = await renderEditorPayload({
        adjustments: state.sliders,
        originalUrl: image.originalUrl,
        storedPreviewUrl: image.previewUrl ?? null,
        baseImageUrl: state.workingImageUrl ?? image.originalUrl,
        imageBase64: null,
        transform: state.transform,
      });
      if (!rendered.imageBase64) throw new Error("Could not render the library cover.");
      return rendered.imageBase64;
    },
  });

  const savedTransform = editorState.transform;
  const baseImageUrl = editorState.workingImageUrl ?? image?.originalUrl ?? null;
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
    comparisonReady,
    isCropping,
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
    getSelectionTools,
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
    saveEditorStateRef.current = async () => {
      await prepareExportState();
      if (!(await saveVersion(true))) throw getSaveError() ?? new Error("Could not save your edits. Please try again.");
    };
  }, [saveVersion, prepareExportState, getSaveError]);

  const handleRestoreHistory = useCallback(async (raw: unknown, label: string) => {
    const finishOperation = beginOperation();
    try {
      const restored = parseVersionAdjustments(raw);
      const isCurrent = createEditGuard();
      const url = restored.workingImageUrl ?? image?.originalUrl;
      cancelCrop();
      if (!url || !(await loadImageUrl(url, isCurrent)) || !isCurrent()) throw new Error("Could not load this saved version");
      restorePersistedState(restored, `Reverted to ${label}`);
    } finally { finishOperation(); }
  }, [beginOperation, restorePersistedState, createEditGuard, image?.originalUrl, loadImageUrl, cancelCrop]);

  const reloadCanvas = useCallback(async (url: string, isCurrent: () => boolean = () => true, label = "Image edited", resetTransform = false, adjustments?: Partial<Adjustments>) => {
    if (!isCurrent()) return false;
    const dims = await probeImageDimensions(url);
    if (!isCurrent()) return false;
    if (!dims) throw new Error("Could not load the edited image");
    if (!(await loadImageUrl(url, isCurrent, resetTransform ? DEFAULT_IMAGE_TRANSFORM : undefined))) return false;
    if (!isCurrent()) return false;
    commitState({
      workingImageUrl: url,
      workingWidth: dims.width,
      workingHeight: dims.height,
      masks: undefined,
      ...(adjustments ? { sliders: normalizeAdjustments(adjustments) } : {}),
      ...(resetTransform ? { transform: { ...DEFAULT_IMAGE_TRANSFORM } } : {}),
    }, true, label);
    return true;
  }, [loadImageUrl, commitState]);

  const handleToggleCrop = useCallback(() => {
    if (isCropping) cancelCrop();
    else { setMobilePanel(null); void startCrop(); }
  }, [isCropping, cancelCrop, startCrop]);

  const commitPixels = useCallback((dataUrl: string | null, isCurrent: () => boolean, label: string) => {
    if (!dataUrl || !isCurrent()) return;
    const dims = getPixelDimensions();
    if (!dims.width || !dims.height) return;
    commitState({
      workingImageUrl: dataUrl,
      workingWidth: dims.width,
      workingHeight: dims.height,
      transform: getTransformSnapshot(),
      masks: undefined,
    }, true, label);
  }, [commitState, getTransformSnapshot, getPixelDimensions]);

  const handleConfirmCrop = useCallback(async () => {
    const finishOperation = beginOperation();
    try {
      const isCurrent = createEditGuard();
      commitPixels(await confirmCrop(isCurrent), isCurrent, "Crop applied");
    } finally { finishOperation(); }
  }, [beginOperation, createEditGuard, confirmCrop, commitPixels]);

  const handleResize = useCallback(async (width: number, height: number) => {
    const finishOperation = beginOperation();
    try {
      const isCurrent = createEditGuard();
      commitPixels(await resizeCanvas(width, height, isCurrent), isCurrent, "Image resized");
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

  const chatTools = useEditorChatTools({
    imageId, originalUrl: image?.originalUrl ?? null, width: image?.width ?? 1, height: image?.height ?? 1,
    ready: versionLoaded && !loadingImage && !!activeImageUrl, isCropping,
    getState: getEditorState, getRevision: getEditorRevision, getSelections: getSelectionTools, brushSizes,
    clearSelections: () => restoreMasks(undefined),
    versions: editorHistoryRows(historyEntries, savedVersions).map((row) => ({ id: row.id, label: row.title })),
    controls: adjustmentControlsRef, patch: (values) => patchAdjustments(values, "Agent adjustments applied"),
    rotateCW, rotateCCW, flipH, flipV, straighten: (degrees) => straightenImage(degrees),
    resize: resizeCanvas, commitPixels, exportMasks: { heal: exportMask, eraser: exportEraserMask, blur: exportBlurMask },
    reload: reloadCanvas, undo: handleUndo, redo: handleRedo, canUndo, canRedo,
    restore: (state) => handleRestoreHistory(serializePersistedEditorState(state), "before chat edits"),
    revert: async (id) => {
      const saved = savedVersions.find((v) => `saved:${v.id}` === id);
      const entry = historyEntries.find((v) => v.id === id);
      if (saved) await handleRestoreHistory(saved.adjustments, saved.label ?? "saved version");
      else if (entry) await handleRestoreHistory(serializePersistedEditorState(entry.state), entry.id === "original" ? "Original" : "version");
      else throw new Error("This version is no longer available.");
    },
    save: async () => {
      const saved = await saveVersion(true);
      if (!saved && getSaveError()) throw getSaveError();
      return saved;
    },
  });

  useEffect(() => {
    if (!canvasHydratedRef.current) return;
    const timer = setTimeout(() => {
      void saveVersion();
    }, 2000);
    return () => clearTimeout(timer);
  }, [editorState, saveVersion, versionLoaded, loadingImage]);

  if (imageMissing) return <ReturnToPreviousPage />;

  return (
    <EditorPreviewProvider
      imageId={imageId}
      saveEditorStateRef={saveEditorStateRef}
    >
      <div className="editor-shell flex flex-col h-dvh bg-[#161616] overflow-hidden" data-mobile-panel={mobilePanel ?? "none"}>
        <Toolbar
          filename={image?.filename}
          zoom={zoom}
          showBefore={showBefore}
          comparisonReady={comparisonReady}
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

        <div className="editor-workspace flex flex-1 min-h-0 min-w-0 overflow-hidden" data-mobile-panel={mobilePanel ?? "none"}>
          <AdjustmentPanel
            mobileLayout={mobileLayout}
            mobileVisible={mobilePanel === "adjustments"}
            onMobilePanelChange={handlePanelOpen}
            mobileChatActive={mobilePanel === "chat"}
            onMobileChatToggle={() => setMobilePanel((panel) => panel === "chat" ? null : "chat")}
            chatControlsRef={adjustmentControlsRef}
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
            brushSizes={brushSizes}
            setBrushSize={setBrushSize}
            enableHealBrush={enableHealBrush}
            disableHealBrush={disableHealBrush}
            exportHealMask={exportMask}
            enableEraserBrush={enableEraserBrush}
            disableEraserBrush={disableEraserBrush}
            exportEraserMask={exportEraserMask}
            enableBlurBrush={enableBlurBrush}
            disableBlurBrush={disableBlurBrush}
            exportBlurMask={exportBlurMask}
            history={{
              entries: historyEntries, currentId: currentHistoryId, versions: savedVersions,
              ready: versionLoaded && !loadingImage, error: historyError,
              onRevert: handleRestoreHistory,
            }}
          />

          <EditorErrorBoundary label="canvas">
            <div className="redux-page-enter editor-canvas-slot relative flex flex-1 min-h-0 min-w-0">
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
                />
              )}
            </div>
          </EditorErrorBoundary>

          <EditorErrorBoundary label="chat">
            <div className="editor-chat-slot flex shrink-0 min-h-0 min-w-0">
              <ChatPanel
                mobileLayout={mobileLayout}
                onMobileClose={() => setMobilePanel(null)}
                getToolContext={chatTools.context}
                getWorkspaceImage={chatTools.workspaceImage}
                onExecuteTools={chatTools.execute}
                adjustments={adjustments}
                onPatch={(patch) => patchAdjustments(patch, "Agent adjustments applied")}
                createEditGuard={createEditGuard}
                createChatEditGuard={createChatEditGuard}
                beginOperation={beginOperation}
                onUndo={handleUndo}
                imageId={imageId}
                canvasImageUrl={baseImageUrl}
              />
            </div>
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
