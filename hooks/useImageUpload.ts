"use client";

import { useState } from "react";

import { useUploadThing } from "@/lib/uploadthing";

export function useImageUpload(onUploadComplete?: () => void) {
  const [progress, setProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);

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
      setProgress(0);
      onUploadComplete?.();
    },
    onUploadError: (err) => {
      console.error("Upload error:", err);
      setProgress(0);
    },
  });

  async function uploadFiles(files: File[]) {
    if (!files.length || isUploading || isProcessing) return;
    await startUpload(files);
  }

  return {
    uploadFiles,
    progress,
    isUploading,
    isProcessing,
    isBusy: isUploading || isProcessing,
  };
}
