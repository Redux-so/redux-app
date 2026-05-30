import { auth } from "@clerk/nextjs/server";
import { type NextRequest, NextResponse } from "next/server";
import { renderAdjustedImage } from "@/lib/apply-image-adjustments";
import { prisma } from "@/lib/prisma";

type ExportFormat = "jpeg" | "png" | "tiff";

interface ExportBody {
  imageId?: string;
  adjustments?: Record<string, number>;
  format?: ExportFormat;
  quality?: number;
  /** Active canvas URL — overrides the DB original when the image has been
   *  replaced by an AI operation (e.g. background removal). */
  imageUrl?: string;
  /** Optional max width for preview thumbnails — applied after all effects. */
  maxWidth?: number;
}

const FORMAT_MIME: Record<ExportFormat, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  tiff: "image/tiff",
};

export async function POST(request: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { clerkId } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const body = (await request.json()) as ExportBody;
  const {
    imageId,
    adjustments = {},
    format = "jpeg",
    quality = 90,
    imageUrl,
    maxWidth,
  } = body;

  if (!imageId) {
    return NextResponse.json({ error: "imageId is required" }, { status: 400 });
  }

  const image = await prisma.image.findFirst({
    where: { id: imageId, userId: user.id },
  });
  if (!image) {
    return NextResponse.json({ error: "Image not found" }, { status: 404 });
  }

  const fetchUrl = imageUrl ?? image.originalUrl;
  const imgResponse = await fetch(fetchUrl);
  if (!imgResponse.ok) {
    return NextResponse.json(
      { error: "Failed to fetch image" },
      { status: 502 },
    );
  }

  const inputBuffer = Buffer.from(await imgResponse.arrayBuffer());

  try {
    const outputBuffer = await renderAdjustedImage(inputBuffer, {
      adjustments,
      format,
      quality,
      maxWidth,
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
