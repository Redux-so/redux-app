import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { CREDIT_COSTS, type CreditFeature } from "@/constants/credits";
import { prisma } from "@/lib/prisma";

export type AtomicCreditChargeResult =
  | { ok: true; balanceAfter: number }
  | { ok: false; reason: "insufficient" };

type TransactionClient = Prisma.TransactionClient;

function assertPositiveIntegerAmount(amount: number, label: string): void {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error(`${label}: amount must be a positive integer, got ${amount}`);
  }
}

async function deductCreditsAtomicInTx(
  tx: TransactionClient,
  params: { userId: string; amount: number; feature: string },
): Promise<AtomicCreditChargeResult> {
  const { userId, amount, feature } = params;
  assertPositiveIntegerAmount(amount, "deductCreditsAtomic");

  const updated = await tx.user.updateMany({
    where: { id: userId, creditBalance: { gte: amount } },
    data: { creditBalance: { decrement: amount } },
  });

  if (updated.count === 0) {
    return { ok: false, reason: "insufficient" };
  }

  const user = await tx.user.findUniqueOrThrow({
    where: { id: userId },
    select: { creditBalance: true },
  });

  await tx.creditTransaction.create({
    data: {
      userId,
      type: "DEDUCTION",
      amount: -amount,
      feature,
    },
  });

  return { ok: true, balanceAfter: user.creditBalance };
}

/**
 * Atomically deduct credits when balance is sufficient and record a ledger entry.
 * Uses a conditional UPDATE so concurrent requests cannot overspend the same balance.
 */
export async function deductCreditsAtomic(params: {
  userId: string;
  amount: number;
  feature: string;
}): Promise<AtomicCreditChargeResult> {
  return prisma.$transaction((tx) => deductCreditsAtomicInTx(tx, params));
}

/**
 * Refund credits and record a ledger entry (paired with a prior deduction).
 */
export async function refundCreditsAtomic(params: {
  userId: string;
  amount: number;
  feature: string;
  description: string;
}): Promise<{ balanceAfter: number }> {
  const { userId, amount, feature, description } = params;
  assertPositiveIntegerAmount(amount, "refundCreditsAtomic");

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: userId },
      data: { creditBalance: { increment: amount } },
      select: { creditBalance: true },
    });

    await tx.creditTransaction.create({
      data: {
        userId,
        type: "REFUND",
        amount,
        feature,
        description,
      },
    });

    return { balanceAfter: user.creditBalance };
  });
}

export function insufficientCreditsResponse(): NextResponse {
  return NextResponse.json({ error: "Insufficient credits" }, { status: 402 });
}

export async function chargeCreditFeature(params: {
  userId: string;
  feature: CreditFeature;
}): Promise<AtomicCreditChargeResult> {
  const amount = CREDIT_COSTS[params.feature];
  return deductCreditsAtomic({
    userId: params.userId,
    amount,
    feature: params.feature,
  });
}

export async function refundCreditFeature(params: {
  userId: string;
  feature: CreditFeature;
  description: string;
}): Promise<{ balanceAfter: number }> {
  const amount = CREDIT_COSTS[params.feature];
  return refundCreditsAtomic({
    userId: params.userId,
    amount,
    feature: params.feature,
    description: params.description,
  });
}
