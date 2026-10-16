import { type NextRequest, NextResponse } from "next/server";
import { renderAdjustedImage } from "@/lib/apply-image-adjustments";
import { prisma } from "@/lib/prisma";
import { enforceFeatureRateLimits } from "@/lib/expensive-route-guard";
import { requireAuthUser } from "@/lib/require-user";
import { resolvePreviewSourceUrl } from "@/lib/resolve-preview-source";
import { exportBodySchema, parseJsonRequest } from "@/lib/api-validation";
import { SafeFetchError, fetchTrustedMediaBuffer } from "@/lib/safe-remote-fetch";

type ExportFormat = "jpeg" | "png" | "tiff";

const FORMAT_MIME: Record<ExportFormat, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  tiff: "image/tiff",
};

export async function POST(request: NextRequest) {
  const authResult = await requireAuthUser();
  if ("error" in authResult) {
    return authResult.error;
  }
  const { user } = authResult;

  const rateLimited = await enforceFeatureRateLimits(user.id, "export");
  if (rateLimited) {
    return rateLimited;
  }

  const parsed = await parseJsonRequest(request, exportBodySchema);
  if (!parsed.ok) {
    return parsed.response;
  }
  const {
    imageId,
    adjustments,
    format,
    quality,
    imageUrl,
    imageBase64,
    transform,
    maxWidth,
  } = parsed.data;

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
          return NextResponse.json({ error: "Untrusted image URL" }, { status: 400 });
        }
        return NextResponse.json({ error: "Failed to fetch image" }, { status: 502 });
      }
    }
  } catch (err) {
    console.error("[export] Failed to resolve image source:", err);
    return NextResponse.json({ error: "Failed to fetch image" }, { status: 400 });
  }

  try {
    const outputBuffer = await renderAdjustedImage(inputBuffer, {
      adjustments,
      format,
      quality,
      maxWidth,
      transform,
    });

    return new NextResponse(outputBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": FORMAT_MIME[format],
        "Content-Disposition": `attachment; filename="export.${format}"`,
        "Content-Length": String(outputBuffer.length),
      },
    });
  } catch (err) {
    console.error("[export] Error:", err);
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}
