import { type NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { AUTOSAVE_VERSION_LABEL, previewImagePublicId, workingImagePublicId } from "@/lib/autosave-version";
import { parseVersionAdjustments, serializePersistedEditorState } from "@/lib/editor-state";
import { uploadToCloudinary } from "@/lib/cloudinary";
import { renderAdjustedImage } from "@/lib/apply-image-adjustments";
import { prisma } from "@/lib/prisma";
import { enforceFeatureRateLimits } from "@/lib/expensive-route-guard";
import { requireAuthUser } from "@/lib/require-user";
import {
  parseJsonRequest,
  parseResourceIdParam,
  saveVersionBodySchema,
} from "@/lib/api-validation";

const versionSelect = {
  id: true,
  imageId: true,
  adjustments: true,
  label: true,
  createdAt: true,
} as const;

export async function GET(request: NextRequest) {
  const authResult = await requireAuthUser();
  if ("error" in authResult) {
    return authResult.error;
  }
  const { user } = authResult;

  const rateLimited = await enforceFeatureRateLimits(user.id, "list_versions");
  if (rateLimited) {
    return rateLimited;
  }

  const { searchParams } = new URL(request.url);
  const imageIdResult = parseResourceIdParam(searchParams.get("imageId") ?? "");
  if (!imageIdResult.ok) {
    return imageIdResult.response;
  }
  const imageId = imageIdResult.data;

  // Verify the image belongs to this user before returning its versions
  const image = await prisma.image.findFirst({
    where: { id: imageId, userId: user.id },
    select: { id: true },
  });
  if (!image) {
    return NextResponse.json({ error: "Image not found" }, { status: 404 });
  }

  const [autosave, versions] = await Promise.all([
    prisma.imageVersion.findFirst({
      where: {
        imageId,
        image: { userId: user.id },
        OR: [{ label: AUTOSAVE_VERSION_LABEL }, { label: null }],
      },
      orderBy: { createdAt: "desc" },
      select: versionSelect,
    }),
    prisma.imageVersion.findMany({
      where: {
        imageId,
        image: { userId: user.id },
        label: { not: null },
        NOT: { label: AUTOSAVE_VERSION_LABEL },
      },
      orderBy: { createdAt: "desc" },
      select: versionSelect,
    }),
  ]);

  return NextResponse.json({ autosave, versions });
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuthUser();
  if ("error" in authResult) {
    return authResult.error;
  }
  const { user } = authResult;

  const rateLimited = await enforceFeatureRateLimits(user.id, "save_version");
  if (rateLimited) {
    return rateLimited;
  }

  const parsed = await parseJsonRequest(request, saveVersionBodySchema);
  if (!parsed.ok) {
    return parsed.response;
  }
  const { imageId, adjustments: rawAdjustments, imageBase64, coverBase64, saveGeneration, label } = parsed.data;

  const isExplicitVersion = label !== undefined && label.length > 0;

  // Verify the image belongs to this user
  const image = await prisma.image.findFirst({
    where: { id: imageId, userId: user.id },
    select: { id: true, originalUrl: true, publicId: true },
  });
  if (!image) {
    return NextResponse.json({ error: "Image not found" }, { status: 404 });
  }

  const editorState = parseVersionAdjustments(rawAdjustments);

  if (imageBase64) {
    const buffer = Buffer.from(imageBase64, "base64");
    const uploaded = await uploadToCloudinary(
      buffer,
      `${workingImagePublicId(image.publicId)}.jpg`,
    );
    editorState.workingImageUrl = uploaded.secureUrl;
  }

  const adjustments = serializePersistedEditorState(editorState);
  const versionUrl = editorState.workingImageUrl ?? image.originalUrl;

  if (isExplicitVersion) {
    const version = await prisma.imageVersion.create({
      data: {
        imageId,
        url: versionUrl,
        publicId: image.publicId,
        adjustments: adjustments as Prisma.InputJsonValue,
        label,
      },
    });

    return NextResponse.json({ version });
  }

  // Upload immutable assets before publishing either the state or its cover.
  // Failed uploads/transactions leave the previous saved cover untouched.
  let previewUrl: string | undefined;
  if (coverBase64) {
    const cover = await renderAdjustedImage(Buffer.from(coverBase64, "base64"), {
      adjustments: {},
      pixelsRendered: true,
      transform: editorState.transform,
      format: "png",
      maxWidth: 512,
    });
    const uploaded = await uploadToCloudinary(cover, `${previewImagePublicId(imageId)}.png`);
    previewUrl = uploaded.secureUrl;
  }

  const result = await prisma.$transaction(async (tx) => {
    // Lock the image so overlapping requests cannot publish older pixels after newer ones.
    await tx.$queryRaw`SELECT id FROM "Image" WHERE id = ${imageId} AND "userId" = ${user.id} FOR UPDATE`;
    const latest = await tx.image.findFirstOrThrow({ where: { id: imageId, userId: user.id } });
    const metadata = latest.metadata && typeof latest.metadata === "object" && !Array.isArray(latest.metadata)
      ? latest.metadata as Record<string, Prisma.InputJsonValue> : {};
    const storedGeneration = typeof metadata.saveGeneration === "number" ? metadata.saveGeneration : 0;
    if (saveGeneration !== undefined && saveGeneration <= storedGeneration) {
      return { stale: true };
    }
    const existingAutosave = await tx.imageVersion.findFirst({
      where: {
        imageId,
        image: { userId: user.id },
        OR: [{ label: AUTOSAVE_VERSION_LABEL }, { label: null }],
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    const data = {
      url: versionUrl,
      publicId: image.publicId,
      adjustments: adjustments as Prisma.InputJsonValue,
      label: AUTOSAVE_VERSION_LABEL,
    };
    const version = existingAutosave
      ? await tx.imageVersion.update({ where: { id: existingAutosave.id }, data })
      : await tx.imageVersion.create({ data: { imageId, ...data } });
    await tx.image.update({
      where: { id: imageId },
      data: {
        ...(previewUrl ? { previewUrl } : {}),
        metadata: { ...metadata, ...(saveGeneration !== undefined ? { saveGeneration } : {}) },
      },
    });
    return { version, previewUrl };
  });

  return NextResponse.json(result);
}
