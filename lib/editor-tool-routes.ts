/** Panel buttons and agent execution share the same paid endpoints and billing. */
export const EDITOR_TOOL_ROUTES = {
  auto_enhance: "/api/ai/enhance",
  auto_tone_balance: "/api/ai/tone",
  smart_color_balance: "/api/ai/color-balance",
  style_match: "/api/ai/style-match",
  remove_background: "/api/ai/background-remove",
  generative_fill: "/api/ai/generative-fill",
  blur: "/api/images/blur",
  eraser: "/api/images/erase",
  heal: "/api/ai/heal",
} as const;
