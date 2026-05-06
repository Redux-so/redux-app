import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const bundles = await prisma.creditBundle.findMany({
    where: { isActive: true },
    orderBy: { price: "asc" },
    select: { id: true, name: true, credits: true, price: true, stripePriceId: true },
  });

  return NextResponse.json({ bundles });
}
