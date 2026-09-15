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
    select: { onboardingCompletedAt: true },
  });

  if (!user) {
    return NextResponse.json({ completed: false });
  }

  return NextResponse.json({ completed: user.onboardingCompletedAt != null });
}

/** Mark product tour as completed (skip, dismiss, or finish). */
export async function POST() {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const updated = await prisma.user.updateMany({
    where: { clerkId },
    data: { onboardingCompletedAt: new Date() },
  });

  if (updated.count === 0) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({ completed: true });
}
