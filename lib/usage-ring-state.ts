import {
  USAGE_RING_CONFIG,
  type UsageQuotaSnapshot,
  type UsageRingPhase,
} from "@/constants/usage-ring";

export type { UsageQuotaSnapshot, UsageRingPhase };

export interface UsageRingViewModel {
  phase: UsageRingPhase;
  /** 0–1 fill amount for the progress arc. */
  fillProgress: number;
  tooltipLine: string;
  purchaseActionLabel: string | null;
  isDepleted: boolean;
  opensPurchaseOnClick: boolean;
}

function freeAllowance() {
  return USAGE_RING_CONFIG.freeChatAllowance;
}

export function deriveUsageRingState(
  quota: UsageQuotaSnapshot | null,
): UsageRingViewModel | null {
  if (!quota) return null;

  const allowance = freeAllowance();
  const freeRemaining = Math.max(0, allowance - quota.lifetimeFreeUsed);
  const { copy } = USAGE_RING_CONFIG;

  if (freeRemaining > 0) {
    const used = Math.min(quota.lifetimeFreeUsed, allowance);
    return {
      phase: "free_active",
      fillProgress: used / allowance,
      tooltipLine: copy.freeActive(used, allowance),
      purchaseActionLabel: null,
      isDepleted: false,
      opensPurchaseOnClick: false,
    };
  }

  if (quota.creditBalance > 0) {
    const total = Math.max(quota.totalPurchasedCredits, quota.creditBalance, 1);
    return {
      phase: "credits_active",
      fillProgress: quota.creditBalance / total,
      tooltipLine: copy.creditsActive(quota.creditBalance, total),
      purchaseActionLabel: null,
      isDepleted: false,
      opensPurchaseOnClick: false,
    };
  }

  if (quota.hasPurchasedCredits) {
    return {
      phase: "credits_exhausted",
      fillProgress: 1,
      tooltipLine: copy.creditsExhausted(),
      purchaseActionLabel: copy.purchaseMoreCredits,
      isDepleted: true,
      opensPurchaseOnClick: true,
    };
  }

  return {
    phase: "free_exhausted",
    fillProgress: 1,
    tooltipLine: copy.freeExhausted(allowance),
    purchaseActionLabel: copy.purchaseCredits,
    isDepleted: true,
    opensPurchaseOnClick: true,
  };
}

export function isChatQuotaBlocked(quota: UsageQuotaSnapshot | null): boolean {
  if (!quota) return false;
  const allowance = freeAllowance();
  const freeRemaining = Math.max(0, allowance - quota.lifetimeFreeUsed);
  return freeRemaining === 0 && quota.creditBalance === 0;
}

export function quotaFromApi(data: {
  lifetimeFreeAI?: number;
  creditBalance?: number;
  totalPurchasedCredits?: number;
  hasPurchasedCredits?: boolean;
}): UsageQuotaSnapshot | null {
  if (
    typeof data.lifetimeFreeAI !== "number" ||
    typeof data.creditBalance !== "number"
  ) {
    return null;
  }

  return {
    lifetimeFreeUsed: data.lifetimeFreeAI,
    creditBalance: data.creditBalance,
    totalPurchasedCredits:
      typeof data.totalPurchasedCredits === "number"
        ? data.totalPurchasedCredits
        : 0,
    hasPurchasedCredits: Boolean(data.hasPurchasedCredits),
  };
}
