import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiInternalErrorResponse } from "@/lib/api-error";
import { requireAuthUser } from "@/lib/require-user";
import { generateAndPersistImageEmbedding } from "@/lib/image-vector-pipeline";
import { embedImageBodySchema, parseJsonRequest } from "@/lib/api-validation";

export async function POST(request: Request) {
  try {
    const authResult = await requireAuthUser();
    if ("error" in authResult) {
      return authResult.error;
    }
    const { user } = authResult;

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

    // CLIP image encoder (Replicate clip-features, inputs = imageUrl) → pgvector(768)
    await generateAndPersistImageEmbedding(imageId, imageUrl, user.id);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiInternalErrorResponse("POST /api/images/embed", err, "Embedding failed");
  }
}
