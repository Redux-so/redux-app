import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiInternalErrorResponse } from "@/lib/api-error";
import { requireAuthUser } from "@/lib/require-user";
import {
  checkRateLimit,
  checkRateLimitPerMinute,
  RATE_LIMIT_MINUTE,
} from "@/lib/kv";
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

function numFromCount(v: unknown): number {
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "number") return v;
  if (typeof v === "string") return Number(v);
  return 0;
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
    if (!minuteLimit.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please slow down." },
        { status: 429 },
      );
    }

    const rateLimit = await checkRateLimit(user.id, "semantic_search", 20);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please slow down." },
        { status: 429 },
      );
    }

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

      const [countRow] = await prisma.$queryRawUnsafe<{ count: unknown }[]>(
        `SELECT COUNT(*)::bigint AS count FROM "Image" WHERE "userId" = $1 AND embedding IS NOT NULL`,
        userId,
      );
      const embeddedForUser = numFromCount(countRow?.count);

      const [userDimRow] = await prisma.$queryRawUnsafe<{ dim: unknown }[]>(
        `SELECT vector_dims(embedding)::int AS dim
         FROM "Image"
         WHERE "userId" = $1 AND embedding IS NOT NULL
         LIMIT 1`,
        userId,
      );
      const storedDimForUser =
        userDimRow?.dim == null ? null : Number(userDimRow.dim);

      const [globalDimRow] = await prisma.$queryRawUnsafe<
        { min_dim: unknown; max_dim: unknown }[]
      >(
        `SELECT
           MIN(vector_dims(embedding))::int AS min_dim,
           MAX(vector_dims(embedding))::int AS max_dim
         FROM "Image"
         WHERE embedding IS NOT NULL`,
      );

      const globalMinDim =
        globalDimRow?.min_dim == null ? null : Number(globalDimRow.min_dim);
      const globalMaxDim =
        globalDimRow?.max_dim == null ? null : Number(globalDimRow.max_dim);

      console.log(
        "[GET /api/ai/search] embeddingDiagnostics userId=%s embeddedCountForUser=%d storedVectorDims(userSample)=%s globalStoredDims(min,max)=(%s,%s) queryEmbeddingLength=%d appExpectedDim=%d",
        userId,
        embeddedForUser,
        storedDimForUser == null ? "n/a" : String(storedDimForUser),
        globalMinDim == null ? "n/a" : String(globalMinDim),
        globalMaxDim == null ? "n/a" : String(globalMaxDim),
        queryDim,
        dim,
      );

      if (storedDimForUser != null && storedDimForUser !== dim) {
        console.error(
          "[GET /api/ai/search] DIMENSION MISMATCH: DB vectors are %d-D but app uses %d-D (CLIP). Align migration + pgvector.ts.",
          storedDimForUser,
          dim,
        );
      }
      if (queryDim !== dim) {
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

      const sqlForLog = searchSql.replace(
        `'${vecLiteral}'`,
        `'<<VECTOR_LITERAL len=${vecLiteral.length} dim=${dim}>>'`,
      );
      console.log("[GET /api/ai/search] executingSql=%s", sqlForLog);
      console.log(
        "[GET /api/ai/search] bindParams userId=$1 (%s)",
        userId,
      );

      const topRows = await prisma.$queryRawUnsafe<SearchRow[]>(
        searchSql,
        userId,
      );

      if (topRows.length === 0) {
        console.log(
          "[GET /api/ai/search] relativeSimilarity topPool=0 returned=0 withEmbedding=%d query=%s",
          embeddedForUser,
          JSON.stringify(rawQuery),
        );
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
        console.log(
          "[GET /api/ai/search] relativeSimilarity invalid baseline withEmbedding=%d query=%s",
          embeddedForUser,
          JSON.stringify(rawQuery),
        );
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

      const scoreRows = rows.map((r) => ({
        id: r.id,
        similarity: rowSimilarity(r),
      }));
      console.log(
        "[GET /api/ai/search] relativeSimilarity baseline=%s floor=%s margin=%s topPool=%d passedRelative=%d cap=%d withEmbedding=%d query=%s",
        baseline.toFixed(4),
        minScore.toFixed(4),
        SIMILARITY_RELATIVE_MARGIN.toFixed(2),
        topRows.length,
        rows.length,
        SEARCH_LIMIT,
        embeddedForUser,
        JSON.stringify(rawQuery),
      );
      console.log(
        "[GET /api/ai/search] scores=%s ids=%s",
        JSON.stringify(scoreRows.map((s) => s.similarity.toFixed(4))),
        JSON.stringify(scoreRows.map((s) => s.id)),
      );
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
