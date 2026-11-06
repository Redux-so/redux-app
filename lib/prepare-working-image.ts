import { appPath } from "@/lib/app-path";
import { genUploader } from "uploadthing/client";
import { IMAGE_MULTIPART_MAX_BYTES } from "@/constants/image-upload";
import { EditorSaveError, saveResponseError } from "@/lib/editor-save-errors";
import type { libraryUploadRouter } from "@/lib/library-upload-router";

const { uploadFiles } = genUploader<typeof libraryUploadRouter>({ url: appPath("/api/images/upload") });

/** Register local crop/resize pixels as an owned source version. */
export async function prepareWorkingImage(imageId: string, source: string, signal?: AbortSignal): Promise<string> {
  if (!source.startsWith("data:")) return source;
  const imageBase64 = source.split(",")[1];
  if (!imageBase64) throw new Error("Could not prepare the current image. No tool was run.");
  if (imageBase64.length > IMAGE_MULTIPART_MAX_BYTES - 4096) {
    const binary = atob(imageBase64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    const [result] = await uploadFiles("editorSource", {
      files: [new File([bytes], "editor-source.png", { type: "image/png" })],
      input: { imageId },
      signal,
    });
    if (!result?.serverData?.sourceUrl) throw new Error(result?.serverData?.error ?? "Could not store the edited image.");
    return result.serverData.sourceUrl;
  }
  const response = await fetch(appPath("/api/images/versions"), {
    method: "POST", headers: { "Content-Type": "application/json" }, signal,
    body: JSON.stringify({ imageId, adjustments: {}, sourceOnly: true, imageBase64 }),
  });
  if (!response.ok) {
    const error = await saveResponseError(response);
    throw new EditorSaveError(`${error.message} No tool was run.`, error.status, error.retryable, error.code);
  }
  const data = await response.json() as { sourceUrl?: string };
  if (!data.sourceUrl) throw new Error("Could not prepare the current image. No tool was run.");
  return data.sourceUrl;
}
