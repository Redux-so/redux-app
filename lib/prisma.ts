import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: (PrismaClient & { __schemaToken?: number }) | undefined;
};

/**
 * Bump when Prisma schema changes require a fresh client in dev (HMR keeps
 * globalThis.prisma across hot reloads).
 */
const PRISMA_CLIENT_SCHEMA_TOKEN = 4;

function createPrismaClient() {
  const client = new PrismaClient() as PrismaClient & { __schemaToken?: number };
  client.__schemaToken = PRISMA_CLIENT_SCHEMA_TOKEN;
  return client;
}

function isFreshPrismaClient(
  client: PrismaClient & { __schemaToken?: number },
): boolean {
  return (
    typeof client.album !== "undefined" &&
    typeof client.chatTurn !== "undefined" &&
    typeof client.chatToolRun !== "undefined" &&
    client.__schemaToken === PRISMA_CLIENT_SCHEMA_TOKEN
  );
}

/** Dev HMR keeps globalThis.prisma across reloads — drop stale clients after schema changes. */
function getPrismaClient() {
  const cached = globalForPrisma.prisma;
  if (cached && isFreshPrismaClient(cached)) {
    return cached;
  }

  const client = createPrismaClient();
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = client;
  }
  return client;
}

export const prisma = getPrismaClient();
