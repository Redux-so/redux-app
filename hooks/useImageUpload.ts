"use client";

import { useCallback, useState } from "react";

function postImageUpload(
  file: File,
  onProgress: (percent: number) => void,
): Promise<{ ok: boolean; status: number }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append("file", file);

    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    });

    xhr.addEventListener("load", () => {
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status });
    });
    xhr.addEventListener("error", () => reject(new Error("Network error during upload")));
    xhr.addEventListener("abort", () => reject(new Error("Upload cancelled")));

    xhr.open("POST", "/api/images");
    xhr.send(formData);
  });
}

export function useImageUpload(onUploadComplete?: () => void) {
  const [progress, setProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

  const uploadFiles = useCallback(
    async (files: File[]) => {
      if (!files.length || isUploading) return;

      const file = files[0]!;
      setIsUploading(true);
      setProgress(0);

      try {
        const result = await postImageUpload(file, setProgress);
        if (!result.ok) {
          console.error("[useImageUpload] Server rejected upload:", result.status);
          return;
        }
        onUploadComplete?.();
      } catch (err) {
        console.error("Upload error:", err);
      } finally {
        setIsUploading(false);
        setProgress(0);
      }
    },
    [isUploading, onUploadComplete],
  );

  return {
    uploadFiles,
    progress,
    isUploading,
    isProcessing: false,
    isBusy: isUploading,
  };
}
