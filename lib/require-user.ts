import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { User } from "@prisma/client";
import {
  type ClerkUserProfile,
  upsertPrismaUser,
} from "@/lib/ensure-prisma-user";

export type RequireAuthUserResult =
  | { user: User }
  | { error: NextResponse };

export function clerkProfileFromWebhookPayload(data: {
  id: string;
  email_addresses: { email_address: string }[];
  first_name: string | null;
  last_name: string | null;
}): ClerkUserProfile {
  const email = data.email_addresses[0]?.email_address ?? "";
  const name =
    [data.first_name, data.last_name].filter(Boolean).join(" ") || null;
  return { clerkId: data.id, email, name };
}

export function clerkProfileFromCurrentUser(
  clerkId: string,
  clerkUser: Awaited<ReturnType<typeof currentUser>>,
): ClerkUserProfile {
  if (!clerkUser) {
    return { clerkId, email: "", name: null };
  }
  const email = clerkUser.emailAddresses[0]?.emailAddress ?? "";
  const name = clerkUser.fullName ?? null;
  return { clerkId, email, name };
}

/** Ensure a Prisma User row exists for this Clerk session (lazy sync on first API touch). */
export async function getPrismaUserForClerkId(clerkId: string): Promise<User> {
  const clerkUser = await currentUser();
  return upsertPrismaUser(clerkProfileFromCurrentUser(clerkId, clerkUser));
}

/** Resolve Clerk session → Prisma User, or return a 401 JSON response. */
export async function requireAuthUser(): Promise<RequireAuthUserResult> {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const user = await getPrismaUserForClerkId(clerkId);
  return { user };
}
