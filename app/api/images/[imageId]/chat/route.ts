import { NextResponse } from "next/server";
import { requireAuthUser } from "@/lib/require-user";
import { ownsChatImage, readChatHistory } from "@/lib/chat-history";

export async function GET(request: Request, { params }: { params: Promise<{ imageId: string }> }) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;
  const { imageId } = await params;
  if (!await ownsChatImage(imageId, auth.user.id)) {
    return NextResponse.json({ error: "Image not found" }, { status: 404 });
  }
  const before = new URL(request.url).searchParams.get("before");
  if (before !== null && (!/^\d+$/.test(before) || Number(before) < 1 || Number(before) > 2147483647)) {
    return NextResponse.json({ error: "Invalid history cursor" }, { status: 400 });
  }
  try {
    const page = await readChatHistory(imageId, auth.user.id, before === null ? undefined : Number(before));
    return NextResponse.json(page, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[chat-history] Could not load messages:", error);
    return NextResponse.json({ error: "Could not load chat history" }, { status: 500 });
  }
}
