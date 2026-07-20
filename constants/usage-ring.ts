/** Thresholds and copy for the chat input usage ring. */
export const USAGE_RING_CONFIG = {
  freeChatAllowance: 20,
  ringTransitionMs: 500,
  tooltipDelayMs: 125,
  copy: {
    freeActive: (used: number, total: number) =>
      `${used}/${total} free chats used`,
    freeExhausted: (total: number) => `0/${total} free chats left`,
    creditsActive: (remaining: number, total: number) =>
      `${remaining}/${total} credits left`,
    creditsExhausted: () => "0 credits left",
    purchaseCredits: "Purchase credits",
    purchaseMoreCredits: "Purchase more credits",
    loading: "Loading…",
  },
} as const;

export type UsageRingPhase =
  | "free_active"
  | "free_exhausted"
  | "credits_active"
  | "credits_exhausted";

export interface UsageQuotaSnapshot {
  lifetimeFreeUsed: number;
  creditBalance: number;
  totalPurchasedCredits: number;
  hasPurchasedCredits: boolean;
}
