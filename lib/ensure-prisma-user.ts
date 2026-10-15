import type { User } from "@prisma/client";
import {
  pendingClerkSyncEmail,
  tombstoneClerkIdentity,
} from "@/lib/clerk-user-profile";
import { prisma } from "@/lib/prisma";

export type ClerkUserProfile = {
  clerkId: string;
  email: string;
  name: string | null;
};

/** Create or update Prisma User from Clerk identity fields (webhook, upload, session sync). */
export async function upsertPrismaUser(profile: ClerkUserProfile): Promise<User> {
  const { clerkId, email, name } = profile;
  const normalizedEmail = email.trim();

  return prisma.user.upsert({
    where: { clerkId },
    update: {
      ...(normalizedEmail ? { email: normalizedEmail } : {}),
      name,
    },
    create: {
      clerkId,
      email: normalizedEmail || pendingClerkSyncEmail(clerkId),
      name,
    },
  });
}

/**
 * Anonymize the Prisma user for a deleted Clerk account.
 * Keeps images, albums, and credit history linked to the same internal user id.
 */
export async function tombstonePrismaUserByClerkId(clerkId: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { clerkId } });
  if (!user) {
    return;
  }

  if (user.clerkId.startsWith("deleted_")) {
    return;
  }

  const tombstone = tombstoneClerkIdentity(user.id);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      clerkId: tombstone.clerkId,
      email: tombstone.email,
      name: null,
    },
  });
}
