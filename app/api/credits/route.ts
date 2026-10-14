import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuthUser } from "@/lib/require-user";

export async function GET() {
  const authResult = await requireAuthUser();
  if ("error" in authResult) {
    return authResult.error;
  }
  const { user } = authResult;

  const purchaseAggregate = await prisma.creditTransaction.aggregate({
    where: { userId: user.id, type: "PURCHASE" },
    _sum: { amount: true },
  });

  const totalPurchasedCredits = purchaseAggregate._sum.amount ?? 0;

  return NextResponse.json({
    creditBalance: user.creditBalance,
    lifetimeFreeAI: user.lifetimeFreeAI,
    totalPurchasedCredits,
    hasPurchasedCredits: totalPurchasedCredits > 0,
  });
}
