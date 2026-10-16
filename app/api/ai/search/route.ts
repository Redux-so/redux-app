import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiInternalErrorResponse } from "@/lib/api-error";
import { requireAuthUser } from "@/lib/require-user";
import {
  checkRateLimit,
  checkRateLimitPerMinute,
  RATE_LIMIT_MINUTE,
} from "@/lib/kv";
import { rateLimitDeniedResponse } from "@/lib/expensive-route-guard";
import { embedSearchQueryText } from "@/lib/search-clip";
import { CLIP_VECTOR_DIM, vectorToPgLiteral } from "@/lib/pgvector";
import type { ImageRecord } from "@/types/image";
import { parseSearchQueryParam } from "@/lib/api-validation";
import {
  chargeCreditFeature,
  insufficientCreditsResponse,
  refundCreditFeature,
} from "@/lib/atomic-credits";
import { CREDIT_COSTS } from "@/constants/credits";

/** GET must stay uncached so clients always get fresh hits (not a stale empty payload). */
export const dynamic = "force-dynamic";

const SEARCH_LIMIT = 20;
/**
 * After taking the top {@link SEARCH_LIMIT} by similarity, keep rows within this margin
 * of the best score (image↔text CLIP tends to separate scores more than text↔text).
 * E.g. best 0.79 → keep ≥ 0.64 when margin is 0.15.
 */
const SIMILARITY_RELATIVE_MARGIN = 0.15;

interface SearchRow {
  id: string;
  originalUrl: string;
  filename: string;
  publicId: string;
  utKey: string | null;
  width: number;
  height: number;
  size: number;
  format: string;
  createdAt: Date | string;
  userId: string;
  similarity: number;
}

function rowSimilarity(r: SearchRow): number {
  const sim =
    typeof r.similarity === "number" ? r.similarity : Number(r.similarity);
  return Number.isFinite(sim) ? sim : NaN;
}

export async function GET(request: Request) {
  try {
    const authResult = await requireAuthUser();
    if ("error" in authResult) {
      return authResult.error;
    }
    const { user } = authResult;

    const { searchParams } = new URL(request.url);
    const queryResult = parseSearchQueryParam(searchParams.get("query"));
    if (!queryResult.ok) {
      return queryResult.response;
    }
    const rawQuery = queryResult.data;

    if (user.creditBalance < CREDIT_COSTS.semantic_search) {
      return insufficientCreditsResponse();
    }

    const minuteLimit = await checkRateLimitPerMinute(
      user.id,
      "semantic_search",
      RATE_LIMIT_MINUTE.semantic_search,
    );
    const minuteDenied = rateLimitDeniedResponse(minuteLimit);
    if (minuteDenied) return minuteDenied;

    const rateLimit = await checkRateLimit(user.id, "semantic_search", 20);
    const hourlyDenied = rateLimitDeniedResponse(rateLimit);
    if (hourlyDenied) return hourlyDenied;

    const charge = await chargeCreditFeature({
      userId: user.id,
      feature: "semantic_search",
    });
    if (!charge.ok) {
      return insufficientCreditsResponse();
    }

    const userId = user.id;

    try {
      const queryVector = await embedSearchQueryText(rawQuery);
      const queryDim = queryVector.length;
      const vecLiteral = vectorToPgLiteral(queryVector);
      const dim = CLIP_VECTOR_DIM;

      if (process.env.NODE_ENV !== "production" && queryDim !== dim) {
        console.error(
          "[GET /api/ai/search] DIMENSION MISMATCH: query embedding length %d !== expected %d",
          queryDim,
          dim,
        );
      }

      // Cosine similarity = 1 − pgvector cosine distance `<=>`. Inline vecLiteral; `$1` = userId.
      const simExpr = `(1 - (i.embedding <=> '${vecLiteral}'::vector(${dim})))::float`;

      // Top K by similarity, no fixed minimum — relative filter applied in app code.
      const searchSql = `SELECT i.id, i."originalUrl", i.filename, i."publicId", i."utKey", i.width, i.height, i.size, i.format, i."createdAt", i."userId",
                ${simExpr} AS similarity
         FROM "Image" i
         WHERE i."userId" = $1
           AND i.embedding IS NOT NULL
           AND i."deletedAt" IS NULL
         ORDER BY similarity DESC
         LIMIT ${SEARCH_LIMIT}`;

      const topRows = await prisma.$queryRawUnsafe<SearchRow[]>(
        searchSql,
        userId,
      );

      if (topRows.length === 0) {
        return NextResponse.json(
          { images: [], query: rawQuery },
          {
            headers: {
              "Cache-Control": "private, no-store, max-age=0",
            },
          },
        );
      }

      const baseline = rowSimilarity(topRows[0]!);
      if (!Number.isFinite(baseline)) {
        return NextResponse.json(
          { images: [], query: rawQuery },
          {
            headers: {
              "Cache-Control": "private, no-store, max-age=0",
            },
          },
        );
      }

      const minScore = baseline - SIMILARITY_RELATIVE_MARGIN;
      const rows = topRows
        .filter((r) => rowSimilarity(r) >= minScore)
        .slice(0, SEARCH_LIMIT);

      const images: ImageRecord[] = rows.map((r) => ({
        id: String(r.id),
        originalUrl: String(r.originalUrl),
        filename: String(r.filename),
        publicId: String(r.publicId),
        utKey: r.utKey,
        width: Number(r.width),
        height: Number(r.height),
        size: Number(r.size),
        format: String(r.format),
        createdAt:
          typeof r.createdAt === "string"
            ? r.createdAt
            : r.createdAt instanceof Date
              ? r.createdAt.toISOString()
              : String(r.createdAt),
        userId: String(r.userId),
      }));

      return NextResponse.json(
        { images, query: rawQuery },
        {
          headers: {
            "Cache-Control": "private, no-store, max-age=0",
          },
        },
      );
    } catch (innerErr) {
      await refundCreditFeature({
        userId: user.id,
        feature: "semantic_search",
        description: "Refund: semantic search failed",
      });
      return apiInternalErrorResponse("GET /api/ai/search", innerErr, "Search failed");
    }
  } catch (outerErr) {
    return apiInternalErrorResponse("GET /api/ai/search", outerErr);
  }
}
