import { type NextRequest, NextResponse } from "next/server";
import { renderAdjustedImage } from "@/lib/apply-image-adjustments";
import { uploadToCloudinary } from "@/lib/cloudinary";
import { prisma } from "@/lib/prisma";
import { apiErrorResponse, logApiError } from "@/lib/api-error";
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

  const parsed = await parseJsonRequest(request, previewMutationBodySchema);
  if (!parsed.ok) {
    return parsed.response;
  }
  const { adjustments, imageUrl, imageBase64, transform } = parsed.data;

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
      format: "jpeg",
      quality: 80,
      maxWidth: 512,
      transform,
    });

    const uploaded = await uploadToCloudinary(
      previewBuffer,
      `preview_${imageId}_${Date.now()}.jpeg`,
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
