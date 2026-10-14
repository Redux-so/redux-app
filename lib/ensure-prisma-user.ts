import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type ClerkUserProfile = {
  clerkId: string;
  email: string;
  name: string | null;
};

/** Create or update Prisma User from Clerk identity fields (webhook, upload, session sync). */
export async function upsertPrismaUser(profile: ClerkUserProfile): Promise<User> {
  const { clerkId, email, name } = profile;
  return prisma.user.upsert({
    where: { clerkId },
    update: { email, name },
    create: { clerkId, email, name },
  });
}
