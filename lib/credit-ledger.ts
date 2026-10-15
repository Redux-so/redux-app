import { prisma } from "@/lib/prisma";
import type { CreditFeature } from "@/constants/credits";
import { CREDIT_COSTS } from "@/constants/credits";

export async function deductCredits(
  userId: string,
  feature: CreditFeature,
  description?: string,
): Promise<number> {
  const cost = CREDIT_COSTS[feature];
  await prisma.user.update({
    where: { id: userId },
    data: { creditBalance: { decrement: cost } },
  });
  await prisma.creditTransaction.create({
    data: {
      userId,
      type: "DEDUCTION",
      amount: -cost,
      feature,
      description,
    },
  });
  return cost;
}

export async function refundCredits(
  userId: string,
  feature: CreditFeature,
  amount: number,
  reason: string,
): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { creditBalance: { increment: amount } },
  });
  await prisma.creditTransaction.create({
    data: {
      userId,
      type: "REFUND",
      amount,
      feature,
      description: reason,
    },
  });
}
