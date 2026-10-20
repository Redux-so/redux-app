import {
  IMAGE_UPLOAD_MAX_BYTES,
  IMAGE_UPLOAD_MIME_TYPES,
  IMAGE_UPLOAD_CONCURRENCY,
} from "@/constants/image-upload";

export interface UploadFailure {
  file: File;
  reason: string;
  retryable: boolean;
}

export function validateUploadFiles(files: File[]) {
  const accepted: File[] = [];
  const rejected: UploadFailure[] = [];
  for (const file of files) {
    let reason: string | undefined;
    if (!(IMAGE_UPLOAD_MIME_TYPES as readonly string[]).includes(file.type)) {
      reason = "JPEG, PNG, or TIFF only";
    } else if (file.size === 0) {
      reason = "File is empty";
    } else if (file.size > IMAGE_UPLOAD_MAX_BYTES) {
      reason = "Exceeds 32 MB limit";
    }
    if (reason) rejected.push({ file, reason, retryable: false });
    else accepted.push(file);
  }
  return { accepted, rejected };
}

/** A bounded queue: a failed request must not interrupt the remaining photos */
export async function runUploadBatch(
  files: File[],
  upload: (file: File, index: number) => Promise<void>,
  onSettled: (file: File, index: number, error?: unknown) => void,
): Promise<void> {
  let nextIndex = 0;
  await Promise.all(Array.from(
    { length: Math.min(IMAGE_UPLOAD_CONCURRENCY, files.length) },
    async () => {
      while (nextIndex < files.length) {
        const index = nextIndex++;
        const file = files[index]!;
        try {
          await upload(file, index);
        } catch (error) {
          onSettled(file, index, error);
          continue;
        }
        onSettled(file, index);
      }
    },
  ));
}
