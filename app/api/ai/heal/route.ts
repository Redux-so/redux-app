import { NextResponse } from "next/server";
import { uploadToCloudinary } from "@/lib/cloudinary";
import { prepareRetouchImage, RetouchMaskError } from "@/lib/retouch-image";
import { inpaintSelection } from "@/lib/retouch-inpaint";
import { prisma } from "@/lib/prisma";
import { apiInternalErrorResponse } from "@/lib/api-error";
import { requireAuthUser } from "@/lib/require-user";
import {
  checkRateLimit,
  checkRateLimitPerMinute,
  RATE_LIMIT_MINUTE,
} from "@/lib/kv";
import { rateLimitDeniedResponse } from "@/lib/expensive-route-guard";
import { maskImageOperationBodySchema, parseJsonRequest } from "@/lib/api-validation";
import {
  chargeCreditFeature,
  insufficientCreditsResponse,
  refundCreditFeature,
} from "@/lib/atomic-credits";
import { CREDIT_COSTS } from "@/constants/credits";
import { withTrustedEditorImage } from "@/lib/safe-remote-fetch";

export async function POST(request: Request) {
  try {
    const authResult = await requireAuthUser();
    if ("error" in authResult) {
      return authResult.error;
    }
    const { user } = authResult;

    if (user.creditBalance < CREDIT_COSTS.heal) {
      return insufficientCreditsResponse();
    }

    const minuteLimit = await checkRateLimitPerMinute(
      user.id,
      "heal",
      RATE_LIMIT_MINUTE.heal,
    );
    const minuteDenied = rateLimitDeniedResponse(minuteLimit);
    if (minuteDenied) return minuteDenied;

    const rateLimit = await checkRateLimit(user.id, "heal", 20);
    const hourlyDenied = rateLimitDeniedResponse(rateLimit);
    if (hourlyDenied) return hourlyDenied;

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

    const charge = await chargeCreditFeature({ userId: user.id, feature: "heal" });
    if (!charge.ok) {
      return insufficientCreditsResponse();
    }

    try {
      const selection = await withTrustedEditorImage(imageUrl, (path) => prepareRetouchImage(path, maskBase64));
      const result = await inpaintSelection(selection, imageId, "heal");
      const uploaded = await uploadToCloudinary(
        result,
        `${image.filename.replace(/\.[^/.]+$/, "")}_heal.png`,
        { preserveOriginal: true },
      );

      await prisma.imageVersion.create({
        data: {
          imageId,
          url: uploaded.secureUrl,
          publicId: uploaded.publicId,
          adjustments: { operationResult: true },
          label: "Heal",
        },
      });

      return NextResponse.json({ resultUrl: uploaded.secureUrl });
    } catch (innerErr) {
      await refundCreditFeature({
        userId: user.id,
        feature: "heal",
        description: "Refund: heal failed",
      });
      if (innerErr instanceof RetouchMaskError) return NextResponse.json({ error: innerErr.message }, { status: 400 });
      return apiInternalErrorResponse("/api/ai/heal", innerErr, "Heal failed");
    }
  } catch (outerErr) {
    return apiInternalErrorResponse("/api/ai/heal", outerErr);
  }
}
