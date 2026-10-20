"use client";

import { useCallback, useRef, useState } from "react";
import toast from "react-hot-toast";
import { IMAGE_UPLOAD_BATCH_LIMIT } from "@/constants/image-upload";
import { runUploadBatch, validateUploadFiles, type UploadFailure } from "@/lib/image-upload-batch";
import type { ImageRecord } from "@/types/image";

function postImageUpload(
  file: File,
  onProgress: (percent: number) => void,
): Promise<ImageRecord> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append("file", file);
    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    });
    xhr.addEventListener("load", () => {
      let body: { image?: ImageRecord; error?: string };
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        reject(new Error("Could not upload photo"));
        return;
      }
      if (xhr.status >= 200 && xhr.status < 300 && body.image) {
        resolve(body.image);
      } else {
        reject(new Error(body.error ?? "Could not upload photo"));
      }
    });
    xhr.addEventListener("error", () => reject(new Error("Network error during upload")));
    xhr.addEventListener("abort", () => reject(new Error("Upload cancelled")));
    xhr.addEventListener("timeout", () => reject(new Error("Upload timed out")));
    xhr.open("POST", "/api/images");
    xhr.timeout = 120_000;
    xhr.send(formData);
  });
}

export function useImageUpload(onUploadComplete?: (image: ImageRecord) => void) {
  const [progress, setProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [completed, setCompleted] = useState(0);
  const [total, setTotal] = useState(0);
  const [failures, setFailures] = useState<UploadFailure[]>([]);
  const uploadInFlight = useRef(false);

  const uploadFiles = useCallback(
    async (files: File[]) => {
      if (!files.length || uploadInFlight.current) return;
      if (files.length > IMAGE_UPLOAD_BATCH_LIMIT) {
        toast.error(`Choose up to ${IMAGE_UPLOAD_BATCH_LIMIT} photos at a time`);
        return;
      }
      const { accepted, rejected } = validateUploadFiles(files);
      setFailures(rejected);
      if (rejected.length) {
        toast.error(`${rejected.length} file${rejected.length === 1 ? "" : "s"} skipped — JPEG, PNG, or TIFF up to 32 MB each`);
      }
      if (!accepted.length) return;

      uploadInFlight.current = true;
      setIsUploading(true);
      setProgress(0);
      setCompleted(0);
      setTotal(accepted.length);
      const fractions = accepted.map(() => 0);
      const totalBytes = accepted.reduce((sum, file) => sum + file.size, 0);
      const failed: UploadFailure[] = [];
      let settled = 0;
      let succeeded = 0;
      function updateProgress(index: number, fraction: number) {
        fractions[index] = fraction;
        const transferred = accepted.reduce((sum, file, i) => sum + file.size * fractions[i]!, 0);
        // A transferred file still needs a successful server response
        setProgress(Math.min(settled === accepted.length ? 100 : 99, Math.floor(transferred / totalBytes * 100)));
      }
      try {
        await runUploadBatch(
          accepted,
          async (file, index) => {
            const image = await postImageUpload(file, (fraction) => updateProgress(index, fraction));
            succeeded++;
            onUploadComplete?.(image);
          },
          (file, index, error) => {
            if (error) {
              const failure = {
                file,
                reason: error instanceof Error ? error.message : "Could not upload photo",
                retryable: true,
              };
              failed.push(failure);
              setFailures((previous) => [...previous, failure]);
            }
            settled++;
            setCompleted(settled);
            updateProgress(index, 1);
          },
        );
        if (failed.length) {
          toast.error(`${succeeded} photo${succeeded === 1 ? "" : "s"} uploaded · ${failed.length} failed`);
        } else {
          toast.success(succeeded === 1 ? "Photo uploaded" : `${succeeded} photos uploaded`);
        }
      } finally {
        uploadInFlight.current = false;
        setIsUploading(false);
      }
    },
    [onUploadComplete],
  );

  const retryFailed = useCallback(
    () => uploadFiles(failures.filter((failure) => failure.retryable).map((failure) => failure.file)),
    [failures, uploadFiles],
  );

  return { uploadFiles, retryFailed, progress, completed, total, failures, isBusy: isUploading };
}

export type ImageUploadState = ReturnType<typeof useImageUpload>;
