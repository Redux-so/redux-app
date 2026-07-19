"use client";

import { useRef } from "react";

import { Icon } from "@/components/shared/Icon";
import { useImageUpload } from "@/hooks/useImageUpload";

interface UploadDropzoneProps {
  onUploadComplete?: () => void;
}

export default function UploadDropzone({ onUploadComplete }: UploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { uploadFiles, progress, isProcessing, isBusy } =
    useImageUpload(onUploadComplete);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (selected) void uploadFiles([selected]);
    e.target.value = "";
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const dropped = e.dataTransfer.files[0];
    if (dropped) void uploadFiles([dropped]);
  }

  return (
    <div className="w-full">
      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => {
          if (!isBusy) inputRef.current?.click();
        }}
        className={[
          "flex min-h-[200px] w-full cursor-pointer flex-col items-center justify-center gap-2.5 rounded-xl border border-dashed border-white/[0.12] bg-[#111111] transition-all duration-200",
          isBusy
            ? "pointer-events-none opacity-80"
            : "hover:border-[#682FBF]/50 hover:bg-[#682FBF]/[0.04]",
        ].join(" ")}
      >
        {isBusy ? (
          <>
            <Icon name="Image05" size={24} className="text-[#682FBF]/50" aria-hidden />
            <p className="text-[14px] text-[#888888]">
              {isProcessing ? "Saving to library..." : "Uploading..."}
            </p>
            <div className="mt-1 h-[2px] w-full max-w-[280px] overflow-hidden rounded-full bg-white/[0.08]">
              <div
                className="h-full rounded-full bg-[#794ADE] transition-all duration-150"
                style={{ width: isProcessing ? "100%" : `${progress}%` }}
              />
            </div>
            {!isProcessing && (
              <p className="text-[12px] text-[#555555]">{progress}%</p>
            )}
          </>
        ) : (
          <>
            <Icon name="Image05" size={24} className="text-[#682FBF]/50" aria-hidden />
            <p className="text-[14px] text-[#888888]">
              Drop a photo here or click to browse
            </p>
            <p className="text-[12px] text-[#555555]">
              JPEG, PNG, TIFF · up to 32 MB
            </p>
          </>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/tiff"
        className="hidden"
        onChange={handleFileChange}
        disabled={isBusy}
      />
    </div>
  );
}
