"use client";

import { BTN_PRIMARY_SOLID } from "@/lib/button-styles";

interface CanvasProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  // Attached to the outer flex-1 container so useCanvas can measure it for
  // proper canvas sizing on init (the <canvas> element defaults to 300×150).
  containerRef: React.RefObject<HTMLDivElement | null>;
  isCropping?: boolean;
  onConfirmCrop?: () => void;
  onCancelCrop?: () => void;
}

export default function Canvas({
  canvasRef,
  containerRef,
  isCropping,
  onConfirmCrop,
  onCancelCrop,
}: CanvasProps) {
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
      <div className="relative inline-block">

        {/* Fabric canvas — always mounted so the hook can initialize */}
        <canvas ref={canvasRef} className="block" />


      </div>

      {/* Crop confirm / cancel — floats above the canvas at the bottom center */}
      {isCropping && (
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
