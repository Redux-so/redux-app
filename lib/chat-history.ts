import { prisma } from "@/lib/prisma";
import { API_LIMITS } from "@/lib/api-validation";
import { cleanChatText, type ChatHistoryPage } from "@/lib/chat-history-shared";
import type { ChatHistoryMessage } from "@/lib/chat-edit-intent";

export async function ownsChatImage(imageId: string, userId: string): Promise<boolean> {
  return !!await prisma.image.findFirst({ where: { id: imageId, userId, deletedAt: null }, select: { id: true } });
}

/** Call only after verifying ownership. Pagination uses an immutable monotonic cursor. */
export async function readChatHistory(imageId: string, userId: string, before?: number): Promise<ChatHistoryPage> {
  const rows = await prisma.chatTurn.findMany({
    where: { imageId, image: { userId, deletedAt: null }, ...(before ? { sequence: { lt: before } } : {}) },
    orderBy: { sequence: "desc" }, take: 21,
    select: { id: true, sequence: true, userText: true, assistantText: true, attachmentUrl: true, status: true, createdAt: true },
  });
  const visible = rows.slice(0, 20);
  return {
    beforeCursor: rows.length > 20 ? visible[visible.length - 1].sequence : null,
    turns: visible.reverse().map((turn) => ({ ...turn, createdAt: turn.createdAt.toISOString() })),
  };
}

/** Stored history and model context have independent limits. No edits are replayed. */
export async function readChatContext(imageId: string, userId: string): Promise<ChatHistoryMessage[]> {
  const rows = await prisma.chatTurn.findMany({
    where: { imageId, image: { userId, deletedAt: null }, status: "complete" },
    orderBy: { sequence: "desc" }, take: Math.ceil(API_LIMITS.CHAT_HISTORY_MAX_MESSAGES / 2),
    select: { userText: true, assistantText: true },
  });
  return rows.reverse().flatMap((turn): ChatHistoryMessage[] => [
    { role: "user", content: turn.userText.slice(0, API_LIMITS.CHAT_HISTORY_MESSAGE_MAX) },
    { role: "assistant", content: cleanChatText(turn.assistantText).slice(0, API_LIMITS.CHAT_HISTORY_MESSAGE_MAX) },
  ]).filter((message) => message.content.trim());
}
