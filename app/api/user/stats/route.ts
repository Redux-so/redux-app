import { NextResponse } from "next/server";
import { ACTIVE_IMAGE_WHERE } from "@/lib/image-query";
import { prisma } from "@/lib/prisma";
import { requireAuthUser } from "@/lib/require-user";

export async function GET() {
  const authResult = await requireAuthUser();
  if ("error" in authResult) {
    return authResult.error;
  }
  const { user } = authResult;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [transactionHistory, imageStats, uploadsToday] = await Promise.all([
    prisma.creditTransaction.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.image.aggregate({
      where: { userId: user.id, ...ACTIVE_IMAGE_WHERE },
      _count: { id: true },
      _sum: { size: true },
    }),
    prisma.image.count({
      where: {
        userId: user.id,
        ...ACTIVE_IMAGE_WHERE,
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
