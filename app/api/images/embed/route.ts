import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiInternalErrorResponse } from "@/lib/api-error";
import { requireAuthUser } from "@/lib/require-user";
import { generateAndPersistImageEmbedding } from "@/lib/image-vector-pipeline";

export async function POST(request: Request) {
  try {
    const authResult = await requireAuthUser();
    if ("error" in authResult) {
      return authResult.error;
    }
    const { user } = authResult;

      const body = await request.json();
    const imageId = typeof body.imageId === "string" ? body.imageId.trim() : "";
    const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl.trim() : "";

    if (!imageId || !imageUrl) {
      return NextResponse.json(
        { error: "imageId and imageUrl are required" },
        { status: 400 },
      );
    }

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
