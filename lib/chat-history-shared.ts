export interface SavedChatTurn {
  id: string;
  sequence: number;
  userText: string;
  assistantText: string;
  attachmentUrl: string | null;
  status: string;
  createdAt: string;
}

export interface ChatHistoryPage {
  turns: SavedChatTurn[];
  beforeCursor: number | null;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  imagePreview?: string;
  timestamp: Date;
  interrupted?: boolean;
}

/** Never expose model tool payloads in either the live thread or saved transcript. */
export function cleanChatText(raw: string): string {
  return raw.replace(/\[adjustments\][\s\S]*?(?:\[\/adjustments\]|$)/g, "").trim();
}

export function messagesFromTurns(turns: SavedChatTurn[]): ChatMessage[] {
  return turns.flatMap((turn) => [
    { id: `${turn.id}:user`, role: "user" as const, content: turn.userText,
      imagePreview: turn.attachmentUrl ?? undefined, timestamp: new Date(turn.createdAt) },
    { id: `${turn.id}:assistant`, role: "assistant" as const,
      content: cleanChatText(turn.assistantText), timestamp: new Date(turn.createdAt),
      interrupted: turn.status !== "complete" },
  ]);
}
