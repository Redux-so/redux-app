import { type NextRequest, NextResponse } from "next/server";
import { renderAdjustedImage } from "@/lib/apply-image-adjustments";
import { previewImagePublicId } from "@/lib/autosave-version";
import { uploadToCloudinary } from "@/lib/cloudinary";
import { prisma } from "@/lib/prisma";
import { apiErrorResponse, logApiError } from "@/lib/api-error";
import { enforceFeatureRateLimits } from "@/lib/expensive-route-guard";
import { requireAuthUser } from "@/lib/require-user";
import { resolvePreviewSourceUrl } from "@/lib/resolve-preview-source";
import { parseJsonRequest, parseResourceIdParam, previewMutationBodySchema } from "@/lib/api-validation";
import { SafeFetchError, fetchTrustedMediaBuffer } from "@/lib/safe-remote-fetch";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ imageId: string }> },
) {
  const authResult = await requireAuthUser();
  if ("error" in authResult) {
    return authResult.error;
  }
  const { user } = authResult;

  const parsed = await parseJsonRequest(request, previewMutationBodySchema);
  if (!parsed.ok) return parsed.response;
  const { adjustments, imageUrl, imageBase64, transform, persist, pixelsRendered } = parsed.data;
  const rateLimited = await enforceFeatureRateLimits(user.id, persist ? "preview" : "canvas_preview");
  if (rateLimited) {
    return rateLimited;
  }

  const { imageId: rawImageId } = await params;
  const imageIdResult = parseResourceIdParam(rawImageId);
  if (!imageIdResult.ok) {
    return imageIdResult.response;
  }
  const imageId = imageIdResult.data;

  const image = await prisma.image.findFirst({
    where: { id: imageId, userId: user.id },
  });
  if (!image) {
    return NextResponse.json({ error: "Image not found" }, { status: 404 });
  }

  let inputBuffer: Buffer;
  try {
    const source = resolvePreviewSourceUrl({
      imageUrl,
      originalUrl: image.originalUrl,
      storedPreviewUrl: image.previewUrl,
      imageBase64,
    });

    if (source.kind === "base64") {
      inputBuffer = Buffer.from(source.base64, "base64");
    } else {
      try {
        const fetched = await fetchTrustedMediaBuffer(source.url);
        inputBuffer = fetched.buffer;
      } catch (fetchErr) {
        if (fetchErr instanceof SafeFetchError && fetchErr.code === "UNTRUSTED_URL") {
          return apiErrorResponse("Untrusted image URL", 400);
        }
        return apiErrorResponse("Failed to fetch image", 502);
      }
    }
  } catch (err) {
    logApiError("POST /api/images/[imageId]/generate-preview", err);
    return apiErrorResponse("Invalid image source", 400);
  }

  try {
    const previewBuffer = await renderAdjustedImage(inputBuffer, {
      adjustments,
      pixelsRendered,
      format: persist ? "jpeg" : "png",
      quality: 80,
      maxWidth: persist ? 512 : 2048,
      pngCompressionLevel: persist ? 9 : 1,
      transform,
    });

    if (!persist) {
      return new NextResponse(previewBuffer as unknown as BodyInit, {
        headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
      });
    }

    const uploaded = await uploadToCloudinary(
      previewBuffer,
      `${previewImagePublicId(imageId)}.jpeg`,
      { overwrite: true, uniqueFilename: false },
    );

    await prisma.image.update({
      where: { id: imageId },
      data: { previewUrl: uploaded.secureUrl },
    });

    return NextResponse.json({ previewUrl: uploaded.secureUrl });
  } catch (err) {
    console.error("[generate-preview] Error:", err);
    return NextResponse.json(
      { error: "Failed to generate preview" },
      { status: 500 },
    );
  }
}
