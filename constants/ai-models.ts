/** Anthropic model used for chat and vision-based AI routes. */
export const ANTHROPIC_DEFAULT_MODEL = "claude-sonnet-4-5" as const;

/** Models exposed in the editor chat model picker (ids must match API usage). */
export const CHAT_AVAILABLE_MODELS = [
  { id: ANTHROPIC_DEFAULT_MODEL, label: "Claude Sonnet 4.5" },
] as const;
