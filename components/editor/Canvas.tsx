"use client";

import Image from "next/image";
import { useState } from "react";
import { BTN_PRIMARY_SOLID } from "@/lib/button-styles";
import type { ViewportTransform } from "@/lib/editor-viewport";
import { LoadingOverlay } from "@/components/shared/LoadingSpinner";

interface CanvasProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  // Attached to the outer flex-1 container so useCanvas can measure it for
  // proper canvas sizing on init (the <canvas> element defaults to 300×150).
  containerRef: React.RefObject<HTMLDivElement | null>;
  originalImageUrl: string | null;
  onOriginalImageLoad: (image: HTMLImageElement) => void;
  showBefore: boolean;
  viewportTransform: ViewportTransform;
  isCropping?: boolean;
  onConfirmCrop?: () => void;
  onCancelCrop?: () => void;
}

export default function Canvas({
  canvasRef,
  containerRef,
  originalImageUrl,
  onOriginalImageLoad,
  showBefore,
  viewportTransform,
  isCropping,
  onConfirmCrop,
  onCancelCrop,
}: CanvasProps) {
  const [readyOriginal, setReadyOriginal] = useState<string | null>(null);
  const [failedOriginal, setFailedOriginal] = useState<string | null>(null);
  const comparing = showBefore && !!originalImageUrl;

  return (
    // containerRef is read by useCanvas to determine canvas dimensions.
    // This div must always be in the DOM — never conditionally render Canvas,
    // otherwise Fabric's init effect ([] deps) fires with canvasRef.current=null
    // and the canvas never initializes.
    <div
      ref={containerRef}
      className="relative flex-1 bg-[#161616] overflow-hidden flex items-center justify-center p-8"
    >
      {/* Canvas wrapper — positioned parent for the overlay divs */}
      <div className={`relative inline-block ${comparing ? "[&_.canvas-container]:invisible" : ""}`}>

        {/* Fabric canvas — always mounted so the hook can initialize */}
        <canvas ref={canvasRef} className="block" />
        {originalImageUrl && (
          <div aria-hidden={!comparing} className={`absolute inset-0 overflow-hidden touch-none bg-[#161616] ${comparing ? "" : "invisible pointer-events-none"}`}>
            {/* Display only: never replace the edited Fabric pixels or export source. */}
            <div className="absolute inset-0" style={{ transform: `matrix(${viewportTransform.join(",")})`, transformOrigin: "0 0" }}>
              <div className="absolute inset-[2.5%]">
                <Image
                  key={originalImageUrl}
                  src={originalImageUrl}
                  alt="Original uploaded image"
                  fill
                  unoptimized
                  loading="eager"
                  sizes="100vw"
                  draggable={false}
                  className="object-contain select-none"
                  onLoad={(event) => {
                    setReadyOriginal(originalImageUrl);
                    onOriginalImageLoad(event.currentTarget);
                  }}
                  onError={() => setFailedOriginal(originalImageUrl)}
                />
              </div>
            </div>
            {failedOriginal === originalImageUrl ? (
              <p role="status" className="absolute inset-0 flex items-center justify-center text-[13px] text-[#888888]">Could not load the original image</p>
            ) : readyOriginal !== originalImageUrl ? (
              <LoadingOverlay className="absolute inset-0" message="Loading original image" srOnlyMessage variant="muted" />
            ) : null}
          </div>
        )}
      </div>

      {/* Crop confirm / cancel — floats above the canvas at the bottom center */}
      {isCropping && !comparing && (
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex gap-3 z-10">
          <button
            onClick={onCancelCrop}
            className="h-[34px] px-5 bg-[#1d1d1d] border border-[#262626] rounded-sm text-[13px] text-white hover:border-[#2e2e2e] transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirmCrop}
            className={BTN_PRIMARY_SOLID}
          >
            Confirm Crop
          </button>
        </div>
      )}

    </div>
  );
}
