import { NextResponse } from "next/server";
import { CREDIT_COSTS } from "@/constants/credits";
import { embedImageBodySchema, parseJsonRequest } from "@/lib/api-validation";
import { apiInternalErrorResponse } from "@/lib/api-error";
import { chargeCreditFeature } from "@/lib/atomic-credits";
import { embedClipImageUrl } from "@/lib/search-clip";
import {
  enforceFeatureRateLimits,
  insufficientCreditsResponse,
} from "@/lib/expensive-route-guard";
import { persistImageEmbedding } from "@/lib/image-vector-pipeline";
import { prisma } from "@/lib/prisma";
import { requireAuthUser } from "@/lib/require-user";

const EMBED_COST = CREDIT_COSTS.image_embed;

export async function POST(request: Request) {
  try {
    const authResult = await requireAuthUser();
    if ("error" in authResult) {
      return authResult.error;
    }
    const { user } = authResult;

    if (user.creditBalance < EMBED_COST) {
      return insufficientCreditsResponse();
    }

    const rateLimited = await enforceFeatureRateLimits(user.id, "embed");
    if (rateLimited) {
      return rateLimited;
    }

    const parsed = await parseJsonRequest(request, embedImageBodySchema);
    if (!parsed.ok) {
      return parsed.response;
    }
    const { imageId, imageUrl } = parsed.data;

    const image = await prisma.image.findFirst({
      where: { id: imageId, userId: user.id },
    });
    if (!image) {
      return NextResponse.json({ error: "Image not found" }, { status: 404 });
    }

    const vector = await embedClipImageUrl(imageUrl);
    const charge = await chargeCreditFeature({ userId: user.id, feature: "image_embed" },
      (tx) => persistImageEmbedding(imageId, user.id, vector, tx));
    if (!charge.ok) return insufficientCreditsResponse();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiInternalErrorResponse("POST /api/images/embed", err, "Embedding failed");
  }
}
