/** User-facing progress summaries, separate from the assistant's saved answer. */
export const CHAT_PROGRESS_LABELS = {
  preparingPhoto: "Preparing your photo...",
  waiting: "Waiting for the agent...",
  thinking: "Thinking...",
  applying: "Editing your photo...",
} as const;

export function initialChatProgress(mode: "agent" | "ask", hasImage: boolean): string {
  return mode === "agent" && hasImage ? CHAT_PROGRESS_LABELS.preparingPhoto : CHAT_PROGRESS_LABELS.waiting;
}

export type ChatProgressEvent =
  | { type: "progress"; text: string }
  | { type: "text"; text: string };

const OPEN = "[progress]";
const CLOSE = "[/progress]";

/** Parse only an optional leading progress block, including tags split across chunks. */
export function createChatProgressParser() {
  let buffer = "";
  let mode: "prefix" | "progress" | "answer" = "prefix";
  let oversized = false;

  return {
    push(chunk: string): ChatProgressEvent[] {
      if (mode === "answer") return chunk ? [{ type: "text", text: chunk }] : [];
      buffer += chunk;
      if (mode === "prefix") {
        const trimmed = buffer.trimStart();
        if (OPEN.startsWith(trimmed) && trimmed.length < OPEN.length) return [];
        if (!trimmed.startsWith(OPEN)) {
          mode = "answer";
          const text = buffer;
          buffer = "";
          return [{ type: "text", text }];
        }
        mode = "progress";
        buffer = trimmed.slice(OPEN.length);
      }
      const end = buffer.indexOf(CLOSE);
      if (end === -1) {
        if (buffer.length > 512) {
          // Optional model-generated status text must not abort a valid answer or tool call.
          // Retain enough of the tail to recognize a closing tag split across chunks.
          oversized = true;
          buffer = buffer.slice(-(CLOSE.length - 1));
        }
        return [];
      }
      const text = buffer.slice(0, end).replace(/\s+/g, " ").trim().slice(0, 180);
      const answer = buffer.slice(end + CLOSE.length);
      buffer = "";
      mode = "answer";
      const events: ChatProgressEvent[] = [];
      if (text && !oversized) events.push({ type: "progress", text });
      if (answer) events.push({ type: "text", text: answer });
      return events;
    },
    finish(): ChatProgressEvent[] {
      if (mode === "progress" || (mode === "prefix" && buffer.trim())) {
        throw new Error("Incomplete chat progress summary");
      }
      return [];
    },
  };
}
