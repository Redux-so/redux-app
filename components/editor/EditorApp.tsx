"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useEditor } from "@/hooks/useEditor";
import { useCanvas } from "@/hooks/useCanvas";
import type { ImageRecord } from "@/types/image";
import { isStoredPreviewUrl } from "@/lib/resolve-preview-source";
import type { PreviewPayload } from "@/lib/preview-request";
import type { AdjustmentKey } from "@/constants/adjustments";
import type { ImageTransform } from "@/lib/image-transform";
import { DEFAULT_IMAGE_TRANSFORM, parseVersionAdjustments, type PersistedEditorState } from "@/lib/editor-state";
import { probeImageDimensions } from "@/lib/probe-image-dimensions";

function stripDataUrlBase64(dataUrl: string): string {
  const comma = dataUrl.indexOf(",");
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}

function resolveWorkingImageUrl(
  originalUrl: string | null,
  baseImageUrl: string | null,
  previewUrl: string | null,
): string | null {
  if (!baseImageUrl || !originalUrl || baseImageUrl === originalUrl) return null;
  if (isStoredPreviewUrl(baseImageUrl, previewUrl)) return null;
  if (baseImageUrl.startsWith("data:")) return null;
  return baseImageUrl;
}

import Toolbar from "@/components/editor/Toolbar";
import AdjustmentPanel from "@/components/editor/AdjustmentPanel";
import Canvas from "@/components/editor/Canvas";
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

  const [image, setImage] = useState<ImageRecord | null>(null);
  const [loadingImage, setLoadingImage] = useState(!!imageId);
  const [showExport, setShowExport] = useState(false);
  const [baseImageUrl, setBaseImageUrl] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const savePreviewRef = useRef<(() => Promise<string | null>) | null>(null);
  const saveEditorStateRef = useRef<(() => Promise<void>) | null>(null);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoRedoOrderRef = useRef<Array<"canvas" | "adjustments">>([]);
  const imageOriginalUrlRef = useRef<string | null>(null);
  const pendingRestoreRef = useRef<PersistedEditorState | null>(null);
  const canvasHydratedRef = useRef(false);
  const authoritativeStateRef = useRef<PersistedEditorState | null>(null);
  const [savedTransform, setSavedTransform] = useState<ImageTransform>({
    ...DEFAULT_IMAGE_TRANSFORM,
  });
  const previewPixelsRef = useRef<Pick<PreviewPayload, "baseImageUrl" | "imageBase64">>({
    baseImageUrl: null,
    imageBase64: null,
  });
  const [transformVersion, setTransformVersion] = useState(0);
  const [canvasDimensions, setCanvasDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);

  useEffect(() => {
    if (!imageId) return;
    canvasHydratedRef.current = false;
    pendingRestoreRef.current = null;
    previewPixelsRef.current = { baseImageUrl: null, imageBase64: null };
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setBaseImageUrl(null);
      setImageBase64(null);
      setCanvasDimensions(null);
      setSavedTransform({ ...DEFAULT_IMAGE_TRANSFORM });
      setLoadingImage(true);
    });
    fetch(`/api/images/${imageId}`)
      .then((res) => res.json())
      .then((data: { image?: ImageRecord }) => {
        if (cancelled) return;
        if (data.image) setImage(data.image);
      })
      .catch(console.error)
      .finally(() => {
        if (!cancelled) setLoadingImage(false);
      });
    return () => {
      cancelled = true;
    };
  }, [imageId]);

  const applyPersistedRestore = useCallback((state: PersistedEditorState) => {
    pendingRestoreRef.current = state;
    setSavedTransform({ ...state.transform });
    if (state.workingWidth && state.workingHeight) {
      setCanvasDimensions({
        width: state.workingWidth,
        height: state.workingHeight,
      });
    } else {
      setCanvasDimensions(null);
    }
    const url = state.workingImageUrl ?? imageOriginalUrlRef.current;
    if (!url) return;
    setBaseImageUrl(state.workingImageUrl ?? url);
    setImageBase64(null);
    previewPixelsRef.current = {
      baseImageUrl: state.workingImageUrl ?? url,
      imageBase64: null,
    };
  }, []);

  useEffect(() => {
    imageOriginalUrlRef.current = image?.originalUrl ?? null;
    if (pendingRestoreRef.current) {
      applyPersistedRestore(pendingRestoreRef.current);
    }
  }, [image?.originalUrl, applyPersistedRestore]);

  const getCanvasSnapshotRef = useRef(() => ({
    transform: { ...DEFAULT_IMAGE_TRANSFORM },
    workingImageUrl: null as string | null,
    imageBase64: null as string | null,
    originalUrl: null as string | null,
    workingWidth: null as number | null,
    workingHeight: null as number | null,
  }));

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
    saveVersion,
    restorePersistedState,
    versionLoaded,
  } = useEditor(imageId, {
    getCanvasSnapshot: () => getCanvasSnapshotRef.current(),
    onPersistedRestore: applyPersistedRestore,
    canAutoSave: () => canvasHydratedRef.current,
  });

  const editorReady = versionLoaded && !loadingImage;
  const canvasSourceUrl = editorReady
    ? baseImageUrl ?? image?.originalUrl ?? null
    : null;

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
    clearCanvasHistory,
    getTransformSnapshot,
  } = useCanvas(canvasSourceUrl, adjustments, savedTransform);

  useLayoutEffect(() => {
    getCanvasSnapshotRef.current = () => {
      if (authoritativeStateRef.current) {
        const auth = authoritativeStateRef.current;
        return {
          transform: { ...auth.transform },
          workingImageUrl: auth.workingImageUrl,
          imageBase64: null,
          originalUrl: imageOriginalUrlRef.current,
          workingWidth: auth.workingWidth,
          workingHeight: auth.workingHeight,
        };
      }
      return {
        transform: getTransformSnapshot(),
        workingImageUrl: resolveWorkingImageUrl(
          imageOriginalUrlRef.current,
          previewPixelsRef.current.baseImageUrl ?? baseImageUrl,
          image?.previewUrl ?? null,
        ),
        imageBase64: previewPixelsRef.current.imageBase64 ?? imageBase64,
        originalUrl: imageOriginalUrlRef.current,
        workingWidth: canvasDimensions?.width ?? null,
        workingHeight: canvasDimensions?.height ?? null,
      };
    };
  }, [
    baseImageUrl,
    canvasDimensions?.height,
    canvasDimensions?.width,
    getTransformSnapshot,
    image?.previewUrl,
    imageBase64,
  ]);

  useEffect(() => {
    if (!activeImageUrl) return;
    let cancelled = false;

    if (activeImageUrl.startsWith("data:")) {
      const b64 = stripDataUrlBase64(activeImageUrl);
      previewPixelsRef.current.imageBase64 = b64;
      queueMicrotask(() => {
        if (!cancelled) setImageBase64(b64);
      });
      return () => {
        cancelled = true;
      };
    }
    if (
      activeImageUrl.startsWith("https://") &&
      !isStoredPreviewUrl(activeImageUrl, image?.previewUrl)
    ) {
      previewPixelsRef.current = {
        baseImageUrl: activeImageUrl,
        imageBase64: null,
      };
      queueMicrotask(() => {
        if (!cancelled) {
          setBaseImageUrl(activeImageUrl);
          setImageBase64(null);
        }
      });
    }
    return () => {
      cancelled = true;
    };
  }, [activeImageUrl, image?.previewUrl]);

  useEffect(() => {
    const url = activeImageUrl ?? baseImageUrl ?? image?.originalUrl ?? null;
    if (!url) return;

    let cancelled = false;
    void probeImageDimensions(url).then((dims) => {
      if (!cancelled && dims) setCanvasDimensions(dims);
    });

    return () => {
      cancelled = true;
    };
  }, [activeImageUrl, baseImageUrl, image?.originalUrl]);

  useEffect(() => {
    if (versionLoaded && !loadingImage && activeImageUrl) {
      canvasHydratedRef.current = true;
    }
  }, [versionLoaded, loadingImage, activeImageUrl]);

  const scheduleEditorSave = useCallback(() => {
    if (!imageId) return;
    if (editorSaveTimerRef.current) clearTimeout(editorSaveTimerRef.current);
    editorSaveTimerRef.current = setTimeout(() => {
      void saveVersion();
    }, 2000);
  }, [imageId, saveVersion]);

  const saveEditorStateNow = useCallback(async () => {
    if (editorSaveTimerRef.current) {
      clearTimeout(editorSaveTimerRef.current);
      editorSaveTimerRef.current = null;
    }
    const saved = await saveVersion(true);
    if (!saved) return;

    if (saved.workingImageUrl) {
      setBaseImageUrl(saved.workingImageUrl);
      setImageBase64(null);
      previewPixelsRef.current = {
        baseImageUrl: saved.workingImageUrl,
        imageBase64: null,
      };
    } else {
      const original = imageOriginalUrlRef.current ?? image?.originalUrl ?? null;
      setBaseImageUrl(original);
      setImageBase64(null);
      previewPixelsRef.current = {
        baseImageUrl: original,
        imageBase64: null,
      };
    }
    if (saved.workingWidth && saved.workingHeight) {
      setCanvasDimensions({
        width: saved.workingWidth,
        height: saved.workingHeight,
      });
    }
    authoritativeStateRef.current = null;
  }, [saveVersion, image?.originalUrl]);

  useEffect(() => {
    saveEditorStateRef.current = saveEditorStateNow;
  }, [saveEditorStateNow]);

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

  const handleRestoreHistory = useCallback(
    async (raw: unknown) => {
      const state = parseVersionAdjustments(raw);
      undoRedoOrderRef.current = [];
      canvasHydratedRef.current = false;
      authoritativeStateRef.current = state;

      restorePersistedState(state);
      applyPersistedRestore(state);
      clearCanvasHistory();
      setImageBase64(null);

      const url =
        state.workingImageUrl ??
        imageOriginalUrlRef.current ??
        image?.originalUrl ??
        null;

      if (url) {
        await loadImageUrl(url);
      }

      canvasHydratedRef.current = true;
      await saveEditorStateNow();
      await savePreviewNow();
    },
    [
      restorePersistedState,
      applyPersistedRestore,
      clearCanvasHistory,
      loadImageUrl,
      image?.originalUrl,
      saveEditorStateNow,
      savePreviewNow,
    ],
  );

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
      await saveEditorStateNow();
    },
    [
      activeImageUrl,
      pushImageHistory,
      getTransformSnapshot,
      loadImageUrl,
      image?.previewUrl,
      savePreviewNow,
      saveEditorStateNow,
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
    await saveEditorStateNow();
  }, [confirmCrop, savePreviewNow, saveEditorStateNow]);

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
      await saveEditorStateNow();
    },
    [resizeCanvas, savePreviewNow, saveEditorStateNow],
  );

  const bumpTransformPreview = useCallback(() => {
    setTransformVersion((v) => v + 1);
    schedulePreviewSave();
    scheduleEditorSave();
  }, [schedulePreviewSave, scheduleEditorSave]);

  const persistTransformNow = useCallback(() => {
    setSavedTransform(getTransformSnapshot());
    bumpTransformPreview();
    void saveEditorStateNow();
  }, [getTransformSnapshot, bumpTransformPreview, saveEditorStateNow]);

  const handlePreviewAdjustment = useCallback(
    (key: AdjustmentKey, value: number) => {
      undoRedoOrderRef.current = [];
      previewAdjustment(key, value);
    },
    [previewAdjustment],
  );

  const handleCommitAdjustment = useCallback(
    (key: AdjustmentKey, value: number) => {
      undoRedoOrderRef.current = [];
      updateAdjustment(key, value);
      void saveEditorStateNow();
    },
    [updateAdjustment, saveEditorStateNow],
  );

  const handlePatchAdjustments = useCallback(
    (patch: Partial<Record<string, number>>) => {
      undoRedoOrderRef.current = [];
      patchAdjustments(patch);
      void saveEditorStateNow();
    },
    [patchAdjustments, saveEditorStateNow],
  );

  const handleRotateCW = useCallback(() => {
    undoRedoOrderRef.current = [];
    rotateCW();
    persistTransformNow();
  }, [rotateCW, persistTransformNow]);

  const handleFlipH = useCallback(() => {
    undoRedoOrderRef.current = [];
    flipH();
    persistTransformNow();
  }, [flipH, persistTransformNow]);

  const handleFlipV = useCallback(() => {
    undoRedoOrderRef.current = [];
    flipV();
    persistTransformNow();
  }, [flipV, persistTransformNow]);

  const handleStraightenPreview = useCallback(
    (degrees: number) => {
      undoRedoOrderRef.current = [];
      straightenImage(degrees);
      setSavedTransform((prev) => ({ ...prev, straighten: degrees }));
      bumpTransformPreview();
    },
    [straightenImage, bumpTransformPreview],
  );

  const handleStraightenCommit = useCallback(
    (degrees: number) => {
      handleStraightenPreview(degrees);
      void saveEditorStateNow();
    },
    [handleStraightenPreview, saveEditorStateNow],
  );

  const handleUndo = useCallback(() => {
    if (canUndoCanvas) {
      void undoLastCanvas().then(() => {
        setSavedTransform(getTransformSnapshot());
        bumpTransformPreview();
        void saveEditorStateNow();
      });
      undoRedoOrderRef.current.push("canvas");
      return;
    }
    if (canUndo) {
      undo();
      undoRedoOrderRef.current.push("adjustments");
      void saveEditorStateNow();
      return;
    }
  }, [canUndoCanvas, canUndo, undoLastCanvas, undo, getTransformSnapshot, bumpTransformPreview, saveEditorStateNow]);

  const handleRedo = useCallback(() => {
    const target = undoRedoOrderRef.current.at(-1);
    if (target === "adjustments" && canRedo) {
      redo();
      undoRedoOrderRef.current.pop();
      void saveEditorStateNow();
      return;
    }
    if (target === "canvas" && canRedoCanvas) {
      void redoLastCanvas().then(() => {
        setSavedTransform(getTransformSnapshot());
        bumpTransformPreview();
        void saveEditorStateNow();
      });
      undoRedoOrderRef.current.pop();
      return;
    }
    if (canRedo) {
      redo();
    } else if (canRedoCanvas) {
      void redoLastCanvas();
    }
  }, [canRedo, canRedoCanvas, redo, redoLastCanvas, getTransformSnapshot, bumpTransformPreview, saveEditorStateNow]);

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
    if (!canvasHydratedRef.current) return;
    schedulePreviewSave();
    scheduleEditorSave();
    return () => {
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
      if (editorSaveTimerRef.current) clearTimeout(editorSaveTimerRef.current);
    };
  }, [
    schedulePreviewSave,
    scheduleEditorSave,
    adjustments,
    baseImageUrl,
    imageBase64,
    transformVersion,
    canvasDimensions,
    versionLoaded,
    loadingImage,
    activeImageUrl,
  ]);

  useEffect(() => {
    return () => {
      void savePreviewRef.current?.();
    };
  }, [imageId]);

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
            onRestoreHistory={handleRestoreHistory}
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

        {showExport && (
          <ExportModal
            open={showExport}
            onClose={() => setShowExport(false)}
            imageId={imageId}
            filename={image?.filename}
            adjustments={adjustments}
            activeImageUrl={activeImageUrl ?? baseImageUrl}
            imageBase64={imageBase64}
            transform={getTransformSnapshot()}
            originalUrl={image?.originalUrl ?? null}
            storedPreviewUrl={image?.previewUrl ?? null}
          />
        )}
      </div>
    </EditorPreviewProvider>
  );
}
