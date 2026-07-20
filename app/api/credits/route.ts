import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: { id: true, creditBalance: true, lifetimeFreeAI: true },
  });

  if (!user) {
    return NextResponse.json({
      creditBalance: 0,
      lifetimeFreeAI: 0,
      totalPurchasedCredits: 0,
      hasPurchasedCredits: false,
    });
  }

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
