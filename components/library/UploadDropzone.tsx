"use client";

import { useRef } from "react";

import { Icon } from "@/components/shared/Icon";
import type { ImageUploadState } from "@/hooks/useImageUpload";
import { BRAND_BG_CLASS } from "@/lib/brand-colors";
import { EMPTY_STATE_ICON_CLASS, SURFACE_GHOST_BTN } from "@/lib/surface-colors";

interface UploadDropzoneProps {
  upload: ImageUploadState;
}

export default function UploadDropzone({ upload }: UploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { uploadFiles, retryFailed, progress, completed, total, failures, isBusy } = upload;
  const retryCount = failures.filter((failure) => failure.retryable).length;

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    void uploadFiles(selected);
    e.target.value = "";
  }

  return (
    <div className="w-full">
      <div
        onClick={() => {
          if (!isBusy) inputRef.current?.click();
        }}
        className={[
          "accent-glow-dropzone-left relative overflow-hidden flex min-h-[128px] w-full cursor-pointer flex-col items-center justify-center gap-2.5 rounded-xl border-2 border-dashed border-[#262626] bg-[#1d1d1d] transition-[border-color,background-color] duration-200",
          isBusy
            ? "pointer-events-none opacity-80"
            : "hover:border-[#282828] hover:bg-white/[0.05]",
        ].join(" ")}
      >
        <div className="relative z-[1] flex w-full flex-col items-center justify-center gap-2.5">
        {isBusy ? (
          <>
            <Icon name="Image05" size={24} className={EMPTY_STATE_ICON_CLASS} aria-hidden />
            <p className="text-[14px] text-[#888888]">
              {total === 1 ? "Uploading photo" : "Uploading photos"}
            </p>
            <div
              role="progressbar"
              aria-label="Photo upload progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
              className="mt-1 h-[2px] w-full max-w-[280px] overflow-hidden rounded-full bg-white/[0.08]"
            >
              <div
                className={`h-full rounded-full ${BRAND_BG_CLASS} transition-all duration-150`}
                style={{ width: `${progress}%` }}
              />
            </div>
            <p role="status" className="text-[12px] text-[#888888]">
              {total > 1 ? `${completed} of ${total} complete · ` : ""}{progress}%
            </p>
          </>
        ) : (
          <>
            <Icon name="Image05" size={24} className={EMPTY_STATE_ICON_CLASS} aria-hidden />
            <p className="text-[14px] text-[#888888]">
              Drop photos anywhere or click to browse
            </p>
            <p className="text-[12px] text-[#555555]">
              JPEG, PNG, TIFF · 32 MB each
            </p>
          </>
        )}
        </div>
      </div>

      {failures.length > 0 && (
        <div className="mt-3 flex items-start justify-between gap-3 text-[12px] text-[#888888]">
          <details className="min-w-0 flex-1">
            <summary className="cursor-pointer">
              {failures.length} {failures.length === 1 ? "photo was" : "photos were"} not uploaded
            </summary>
            <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto">
              {failures.map((failure, index) => (
                <li key={index} className="break-words">
                  {failure.file.name} — {failure.reason}
                </li>
              ))}
            </ul>
          </details>
          {retryCount > 0 && (
            <button
              type="button"
              disabled={isBusy}
              onClick={() => void retryFailed()}
              className={`${SURFACE_GHOST_BTN} shrink-0 rounded-md px-2.5 py-1.5 disabled:cursor-not-allowed disabled:opacity-40`}
            >
              Retry failed
            </button>
          )}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/tiff"
        multiple
        className="hidden"
        onChange={handleFileChange}
        disabled={isBusy}
      />
    </div>
  );
}
