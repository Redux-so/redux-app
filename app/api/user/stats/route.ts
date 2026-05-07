import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { clerkId } });
  if (!user) {
    return NextResponse.json({
      creditBalance: 0,
      transactionHistory: [],
      imageCount: 0,
      totalStorageBytes: 0,
      uploadsToday: 0,
    });
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [transactionHistory, imageStats, uploadsToday] = await Promise.all([
    prisma.creditTransaction.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.image.aggregate({
      where: { userId: user.id },
      _count: { id: true },
      _sum: { size: true },
    }),
    prisma.image.count({
      where: {
        userId: user.id,
        createdAt: { gte: todayStart },
      },
    }),
  ]);

  return NextResponse.json({
    creditBalance: user.creditBalance,
    transactionHistory,
    imageCount: imageStats._count.id,
    totalStorageBytes: imageStats._sum.size ?? 0,
    uploadsToday,
  });
}
