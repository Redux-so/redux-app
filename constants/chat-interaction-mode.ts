import type { IconName } from "@/components/shared/Icon";

export type ChatInteractionModeId = "agent" | "ask";

export const DEFAULT_CHAT_INTERACTION_MODE: ChatInteractionModeId = "agent";

/** Appended in Ask mode when the user requests image edits. */
export const ASK_SWITCH_TO_AGENT_NUDGE =
  "To apply changes to your photo, switch to Agent in the chat toolbar.";

export const CHAT_INTERACTION_MODES = [
  {
    id: "agent" as const,
    label: "Agent",
    description: "Apply edits to your photo from chat instructions.",
    /** CpuChip01 — closest Untitled UI match to a robot/agent control. */
    icon: "CpuChip01" satisfies IconName,
  },
  {
    id: "ask" as const,
    label: "Ask",
    description: "Get advice and answers without changing your photo.",
    icon: "MessageSquare01" satisfies IconName,
  },
] as const;

export function getChatInteractionMode(id: ChatInteractionModeId) {
  return CHAT_INTERACTION_MODES.find((mode) => mode.id === id) ?? CHAT_INTERACTION_MODES[0];
}
