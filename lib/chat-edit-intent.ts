import { ASK_SWITCH_TO_AGENT_NUDGE } from "@/constants/chat-interaction-mode";

export interface ChatHistoryMessage {
  role: "user" | "assistant";
  content: string;
}

/** User is asking for feedback or ideas — respond with text only. */
const ADVICE_SEEKING_PATTERNS: RegExp[] = [
  /\bwhat do you think\b/i,
  /\b(any|some|your) suggestions?\b/i,
  /\bhow (can|could|should|would) i improve\b/i,
  /\bhow (can|could|would) (you|we) improve\b/i,
  /\bhow does (this|it|the photo) look\b/i,
  /\b(feedback|critique|advice|opinion)\b/i,
  /\bwhat('s| is) wrong with\b/i,
  /\bwhat would you (change|recommend|suggest|do)\b/i,
  /\b(any|some) (ideas|recommendations)\b/i,
  /\bwhat (can|could|should) (be|i) (improved|fixed|better)\b/i,
  /\btell me (what|how|about)\b/i,
  /\bsuggest(ions?| ways)\b/i,
];

/** User is giving a direct edit instruction. */
const EDIT_COMMAND_PATTERNS: RegExp[] = [
  /\b(make|adjust|increase|decrease|boost|reduce|raise|lower|add|remove|set|warm|cool|brighten|darken)\b/i,
  /\b(fix|correct|enhance) (the|this|my)\b/i,
  /\b(apply|use) (this|these|those|the) (edit|adjustment|change|look|grade|style)\b/i,
  /\b(increase|decrease|boost|reduce|raise|lower) (the )?(exposure|contrast|saturation|vibrance|temperature|tint|highlights|shadows|whites|blacks|vignette|grain|clarity|sharpen|noise)\b/i,
];

/** User is confirming they want prior suggestions applied. */
const APPLY_CONFIRMATION_PATTERNS: RegExp[] = [
  /\bapply (that|those|these|it|them)\b/i,
  /\b(do it|go ahead|make (those|these|the) changes?)\b/i,
  /\byes(,? please)?\b/i,
  /\bsounds good\b/i,
  /\bgo for it\b/i,
];

function hasPriorAssistantTurn(history: ChatHistoryMessage[]): boolean {
  return history.some((m) => m.role === "assistant" && m.content.trim());
}

function isAdviceSeekingMessage(message: string): boolean {
  return ADVICE_SEEKING_PATTERNS.some((pattern) => pattern.test(message));
}

function isExplicitEditCommand(message: string): boolean {
  return EDIT_COMMAND_PATTERNS.some((pattern) => pattern.test(message));
}

function isApplyConfirmation(message: string): boolean {
  return APPLY_CONFIRMATION_PATTERNS.some((pattern) => pattern.test(message));
}

/**
 * Whether the client/server should auto-apply a [adjustments] block for this turn.
 * Conservative default: advice and ambiguous messages do not apply edits.
 */
export function shouldApplyChatAdjustments(
  userMessage: string,
  conversationHistory: ChatHistoryMessage[] = [],
): boolean {
  const message = userMessage.trim();
  if (!message) return false;

  if (isApplyConfirmation(message)) {
    return hasPriorAssistantTurn(conversationHistory);
  }

  if (isAdviceSeekingMessage(message)) {
    return false;
  }

  if (isExplicitEditCommand(message)) {
    return true;
  }

  return false;
}

/** Ask never applies; Agent always allows emit/apply when the model returns adjustments. */
export function allowChatAdjustmentsForTurn(mode: "agent" | "ask"): boolean {
  return mode === "agent";
}

/** Ask-mode nudge: user message looks like a request to change the photo. */
export function isImageChangeRequestMessage(
  userMessage: string,
  conversationHistory: ChatHistoryMessage[] = [],
): boolean {
  return shouldApplyChatAdjustments(userMessage, conversationHistory);
}

export function askModeNudgeMissing(assistantText: string): boolean {
  const normalized = assistantText.toLowerCase();
  return (
    !normalized.includes("switch to agent") &&
    !normalized.includes(ASK_SWITCH_TO_AGENT_NUDGE.toLowerCase())
  );
}


/** Agent already authorizes requested edits; distinguish permission-seeking from real choices. */
export function agentReplyRequestsEditPermission(reply: string): boolean {
  if (/\b(?:or|which|where)\b/i.test(reply)) return false;
  return /\b(?:would you like me to|do you want me to|shall i|should i|can i)\s+(?:apply|make|adjust|edit|brighten|darken|warm|cool|enhance|crop|rotate|remove|reduce|increase|decrease)\b/i.test(reply);
}
