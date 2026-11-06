import { NextResponse } from "next/server";
import { uploadToCloudinary } from "@/lib/cloudinary";
import { prepareRetouchImage, RetouchMaskError } from "@/lib/retouch-image";
import { inpaintSelection } from "@/lib/retouch-inpaint";
import { prisma } from "@/lib/prisma";
import { CREDIT_COSTS } from "@/constants/credits";
import { apiInternalErrorResponse } from "@/lib/api-error";
import { deductCredits, refundCredits } from "@/lib/credit-ledger";
import {
  enforceFeatureRateLimits,
  insufficientCreditsResponse,
} from "@/lib/expensive-route-guard";
import { requireAuthUser } from "@/lib/require-user";
import { maskImageOperationBodySchema, parseJsonRequest } from "@/lib/api-validation";
import { withTrustedEditorImage } from "@/lib/safe-remote-fetch";

const ERASE_COST = CREDIT_COSTS.erase;

export async function POST(request: Request) {
  try {
    const authResult = await requireAuthUser();
    if ("error" in authResult) {
      return authResult.error;
    }
    const { user } = authResult;

    if (user.creditBalance < ERASE_COST) {
      return insufficientCreditsResponse();
    }

    const rateLimited = await enforceFeatureRateLimits(user.id, "erase");
    if (rateLimited) {
      return rateLimited;
    }

    const parsed = await parseJsonRequest(request, maskImageOperationBodySchema);
    if (!parsed.ok) {
      return parsed.response;
    }
    const { imageUrl, maskBase64, imageId } = parsed.data;

    const image = await prisma.image.findFirst({
      where: { id: imageId, userId: user.id },
    });
    if (!image) {
      return NextResponse.json({ error: "Image not found" }, { status: 404 });
    }

    await deductCredits(user.id, "erase");

    try {
      const selection = await withTrustedEditorImage(imageUrl, (path) => prepareRetouchImage(path, maskBase64));
      const result = await inpaintSelection(selection, imageId, "erase");
      const uploaded = await uploadToCloudinary(
        result,
        `${image.filename.replace(/\.[^/.]+$/, "")}_erase.png`,
        { preserveOriginal: true },
      );

      await prisma.imageVersion.create({
        data: {
          imageId,
          url: uploaded.secureUrl,
          publicId: uploaded.publicId,
          adjustments: { operationResult: true },
          label: "Eraser",
        },
      });

      return NextResponse.json({ resultUrl: uploaded.secureUrl });
    } catch (innerErr) {
      await refundCredits(user.id, "erase", ERASE_COST, "Erase failed");
      if (innerErr instanceof RetouchMaskError) return NextResponse.json({ error: innerErr.message }, { status: 400 });
      return apiInternalErrorResponse("/api/images/erase", innerErr, "Erase failed");
    }
  } catch (outerErr) {
    return apiInternalErrorResponse("/api/images/erase", outerErr);
  }
}
