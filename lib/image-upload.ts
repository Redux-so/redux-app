import { API_LIMITS } from "@/lib/api-validation";

/** Matches library dropzone copy and former UploadThing router limits. */
export const IMAGE_UPLOAD_MAX_BYTES = 32 * 1024 * 1024;

export const IMAGE_UPLOAD_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/tiff",
] as const;

export type ImageUploadMimeType = (typeof IMAGE_UPLOAD_MIME_TYPES)[number];

const MIME_SET = new Set<string>(IMAGE_UPLOAD_MIME_TYPES);

export type ParseImageUploadResult =
  | { ok: true; buffer: Buffer; name: string; size: number; mimeType: ImageUploadMimeType }
  | { ok: false; error: string; status: number };

export async function parseImageUploadFormData(
  formData: FormData,
): Promise<ParseImageUploadResult> {
  const file = formData.get("file");
  if (!file || !(file instanceof Blob)) {
    return { ok: false, error: "file is required", status: 400 };
  }

  const mimeType = file.type;
  if (!MIME_SET.has(mimeType)) {
    return {
      ok: false,
      error: "Unsupported file type (JPEG, PNG, or TIFF only)",
      status: 400,
    };
  }

  const size = file.size;
  if (size <= 0) {
    return { ok: false, error: "Empty file", status: 400 };
  }
  if (size > IMAGE_UPLOAD_MAX_BYTES) {
    return { ok: false, error: "File exceeds 32 MB limit", status: 400 };
  }

  const rawName =
    file instanceof File && file.name.trim().length > 0
      ? file.name.trim()
      : `upload.${mimeType === "image/png" ? "png" : mimeType === "image/tiff" ? "tiff" : "jpg"}`;

  if (rawName.length > API_LIMITS.UPLOAD_NAME_MAX) {
    return { ok: false, error: "Filename too long", status: 400 };
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  return {
    ok: true,
    buffer,
    name: rawName,
    size,
    mimeType: mimeType as ImageUploadMimeType,
  };
}
