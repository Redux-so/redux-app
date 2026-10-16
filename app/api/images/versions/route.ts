import { type NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { AUTOSAVE_VERSION_LABEL, workingImagePublicId } from "@/lib/autosave-version";
import { parseVersionAdjustments, serializePersistedEditorState } from "@/lib/editor-state";
import { uploadToCloudinary } from "@/lib/cloudinary";
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
  const { imageId, adjustments: rawAdjustments, imageBase64, label } = parsed.data;

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
      { overwrite: true, uniqueFilename: false },
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

  const existingAutosave = await prisma.imageVersion.findFirst({
    where: {
      imageId,
      image: { userId: user.id },
      OR: [{ label: AUTOSAVE_VERSION_LABEL }, { label: null }],
    },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  const version = existingAutosave
    ? await prisma.imageVersion.update({
        where: { id: existingAutosave.id },
        data: {
          url: versionUrl,
          publicId: image.publicId,
          adjustments: adjustments as Prisma.InputJsonValue,
          label: AUTOSAVE_VERSION_LABEL,
        },
      })
    : await prisma.imageVersion.create({
        data: {
          imageId,
          url: versionUrl,
          publicId: image.publicId,
          adjustments: adjustments as Prisma.InputJsonValue,
          label: AUTOSAVE_VERSION_LABEL,
        },
      });

  return NextResponse.json({ version });
}
