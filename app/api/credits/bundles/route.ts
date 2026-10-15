import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuthUser } from "@/lib/require-user";

export async function GET() {
  const authResult = await requireAuthUser();
  if ("error" in authResult) {
    return authResult.error;
  }

  const bundles = await prisma.creditBundle.findMany({
    where: { isActive: true },
    orderBy: { price: "asc" },
    select: { id: true, name: true, credits: true, price: true, stripePriceId: true },
  });

  return NextResponse.json({ bundles });
}
