import type { ImageTransform } from "@/lib/image-transform";
import { resolvePreviewSourceUrl } from "@/lib/resolve-preview-source";

export interface PreviewPayload {
  pixelsRendered?: boolean;
  adjustments: Record<string, number>;
  originalUrl: string | null;
  storedPreviewUrl: string | null;
  baseImageUrl: string | null;
  imageBase64: string | null;
  transform: ImageTransform;
}

export interface PreviewRequestBody {
  pixelsRendered?: boolean;
  adjustments: Record<string, number>;
  imageUrl?: string;
  imageBase64?: string;
  transform?: ImageTransform;
}

export function buildPreviewRequestBody(
  payload: PreviewPayload,
): PreviewRequestBody {
  const source = resolvePreviewSourceUrl({
    imageUrl: payload.baseImageUrl,
    originalUrl: payload.originalUrl ?? "",
    storedPreviewUrl: payload.storedPreviewUrl,
    imageBase64: payload.imageBase64,
  });

  const body: PreviewRequestBody = {
    pixelsRendered: payload.pixelsRendered,
    adjustments: payload.adjustments,
    transform: payload.transform,
  };

  if (source.kind === "base64") {
    body.imageBase64 = source.base64;
  } else {
    body.imageUrl = source.url;
  }

  return body;
}
