import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type RequireAuthUserResult =
  | { user: User }
  | { error: NextResponse };

/** Resolve Clerk session → Prisma User, or return a 401/404 JSON response. */
export async function requireAuthUser(): Promise<RequireAuthUserResult> {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const user = await prisma.user.findUnique({ where: { clerkId } });
  if (!user) {
    return { error: NextResponse.json({ error: "User not found" }, { status: 404 }) };
  }

  return { user };
}
