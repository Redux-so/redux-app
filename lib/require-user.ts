import { auth, currentUser } from "@clerk/nextjs/server";
import type { NextResponse } from "next/server";
import type { User } from "@prisma/client";
import { apiUnauthorizedResponse } from "@/lib/api-error";
import {
  displayNameFromClerkParts,
  primaryEmailFromWebhookAddresses,
  type ClerkWebhookUserData,
} from "@/lib/clerk-user-profile";
import {
  type ClerkUserProfile,
  upsertPrismaUser,
} from "@/lib/ensure-prisma-user";

export type RequireAuthUserResult =
  | { user: User }
  | { error: NextResponse };

export function clerkProfileFromWebhookPayload(
  data: ClerkWebhookUserData,
): ClerkUserProfile {
  const email = primaryEmailFromWebhookAddresses(
    data.email_addresses,
    data.primary_email_address_id,
  );
  const name = displayNameFromClerkParts(data.first_name, data.last_name);
  return { clerkId: data.id, email, name };
}

export function clerkProfileFromCurrentUser(
  clerkId: string,
  clerkUser: Awaited<ReturnType<typeof currentUser>>,
): ClerkUserProfile {
  if (!clerkUser) {
    return { clerkId, email: "", name: null };
  }
  const email =
    clerkUser.primaryEmailAddress?.emailAddress ??
    clerkUser.emailAddresses[0]?.emailAddress ??
    "";
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
    return { error: apiUnauthorizedResponse() };
  }

  const user = await getPrismaUserForClerkId(clerkId);
  return { user };
}
