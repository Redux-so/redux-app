"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Upload, X, ImageIcon } from "lucide-react";
import { useUploadThing } from "@/lib/uploadthing";
import { BTN_PRIMARY_SOLID } from "@/lib/button-styles";

interface UploadButtonProps {
  onUploadComplete?: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function UploadButton({ onUploadComplete }: UploadButtonProps) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const { startUpload, isUploading } = useUploadThing("imageUploader", {
    onUploadProgress: (p) => setProgress(p),
    onClientUploadComplete: async (files) => {
      const uploaded = files[0];
      if (uploaded) {
        setIsProcessing(true);
        try {
          await fetch("/api/images", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ufsUrl: uploaded.ufsUrl,
              utKey: uploaded.key,
              name: uploaded.name,
              size: uploaded.size,
            }),
          });
        } finally {
          setIsProcessing(false);
        }
      }
      handleClose();
      onUploadComplete?.();
    },
    onUploadError: (err) => {
      console.error("Upload error:", err);
    },
  });

  function handleClose() {
    if (isUploading || isProcessing) return;
    setOpen(false);
    setFile(null);
    setProgress(0);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (selected) setFile(selected);
    e.target.value = "";
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const dropped = e.dataTransfer.files[0];
    if (dropped) setFile(dropped);
  }

  async function handleUpload() {
    if (!file || isUploading) return;
    await startUpload([file]);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={BTN_PRIMARY_SOLID}
      >
        <Upload size={14} strokeWidth={2} />
        Upload Photos
      </button>

      {open && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleClose();
          }}
        >
          <div className="mx-4 w-full max-w-[480px] rounded-xl border border-white/[0.1] bg-[#111111] p-6 shadow-2xl">
            {/* Header */}
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-[16px] font-medium text-white">
                Upload Photos
              </h2>
              <button
                onClick={handleClose}
                disabled={isUploading || isProcessing}
                className="flex h-8 w-8 items-center justify-center rounded-md text-[#888888] hover:bg-white/[0.07] hover:text-white transition-colors cursor-pointer disabled:opacity-40"
              >
                <X size={16} strokeWidth={1.5} />
              </button>
            </div>

            {/* Drop zone — shown when no file is selected */}
            {!file && (
              <div
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                onClick={() => inputRef.current?.click()}
                className="flex h-[180px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/[0.12] transition-all duration-200 hover:border-[#682FBF]/50 hover:bg-[#682FBF]/[0.04]"
              >
                <ImageIcon size={28} strokeWidth={1} className="text-[#682FBF]/50" />
                <p className="text-[13px] text-[#888888]">
                  Drop a photo here or click to browse
                </p>
                <p className="text-[12px] text-[#555555]">
                  JPEG, PNG, TIFF · up to 32 MB
                </p>
              </div>
            )}

            {/* File preview — shown after selection */}
            {file && (
              <div className="flex items-center gap-3 rounded-lg border border-white/[0.08] bg-white/[0.03] p-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.06]">
                  <ImageIcon size={16} strokeWidth={1.5} className="text-[#555555]" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] text-white">{file.name}</p>
                  <p className="text-[12px] text-[#888888]">
                    {formatBytes(file.size)}
                  </p>
                </div>
                {!isUploading && !isProcessing && (
                  <button
                    onClick={() => setFile(null)}
                    className="shrink-0 text-[#555555] hover:text-white transition-colors cursor-pointer"
                  >
                    <X size={15} strokeWidth={1.5} />
                  </button>
                )}
              </div>
            )}

            {/* Progress bar */}
            {(isUploading || isProcessing) && (
              <div className="mt-3">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[13px] text-[#888888]">
                    {isProcessing ? "Saving to library..." : "Uploading..."}
                  </span>
                  {!isProcessing && (
                    <span className="text-[13px] text-[#888888]">{progress}%</span>
                  )}
                </div>
                <div className="h-[2px] overflow-hidden rounded-full bg-white/[0.08]">
                  <div
                    className="h-full rounded-full bg-[#794ADE] transition-all duration-150"
                    style={{ width: isProcessing ? "100%" : `${progress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Footer actions */}
            <div className="mt-5 flex items-center justify-between">
              <button
                onClick={() => inputRef.current?.click()}
                disabled={isUploading || isProcessing}
                className="text-[12px] text-[#555555] hover:text-[#888888] transition-colors cursor-pointer disabled:cursor-default disabled:opacity-40"
              >
                {file ? "Change file" : ""}
              </button>

              {file && !isUploading && !isProcessing && (
                <button
                  onClick={handleUpload}
                  className={BTN_PRIMARY_SOLID}
                >
                  <Upload size={14} strokeWidth={2} />
                  Upload
                </button>
              )}
            </div>

            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/tiff"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
