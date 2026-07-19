import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

function createPrismaClient() {
  return new PrismaClient();
}

/** Dev HMR keeps globalThis.prisma across reloads — drop stale clients after schema changes. */
function getPrismaClient() {
  const cached = globalForPrisma.prisma;
  if (cached && typeof cached.album !== "undefined") {
    return cached;
  }

  const client = createPrismaClient();
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = client;
  }
  return client;
}

export const prisma = getPrismaClient();
