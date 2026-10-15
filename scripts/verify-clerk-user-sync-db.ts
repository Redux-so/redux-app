/**
 * SEC-07 DB integration check (requires DATABASE_URL).
 * Run: pnpm exec tsx scripts/verify-clerk-user-sync-db.ts
 */
import { prisma } from "../lib/prisma";
import {
  tombstonePrismaUserByClerkId,
  upsertPrismaUser,
} from "../lib/ensure-prisma-user";
import { clerkProfileFromWebhookPayload } from "../lib/require-user";

async function main() {
const clerkId = `user_sec07_test_${Date.now()}`;

const profile = clerkProfileFromWebhookPayload({
  id: clerkId,
  email_addresses: [
    { id: "idn_a", email_address: "secondary@test.invalid" },
    { id: "idn_b", email_address: "primary@test.invalid" },
  ],
  primary_email_address_id: "idn_b",
  first_name: "SEC",
  last_name: "07",
});

const created = await upsertPrismaUser(profile);
if (created.email !== "primary@test.invalid") {
  throw new Error(`Expected primary email, got ${created.email}`);
}

const replay = await upsertPrismaUser({ ...profile, name: "SEC 07 Replay" });
if (replay.id !== created.id || replay.name !== "SEC 07 Replay") {
  throw new Error("Replay upsert did not update same user");
}

await tombstonePrismaUserByClerkId(clerkId);
const after = await prisma.user.findUnique({ where: { id: created.id } });
if (!after?.clerkId.startsWith("deleted_")) {
  throw new Error("Tombstone clerkId missing");
}

await tombstonePrismaUserByClerkId(clerkId);

await prisma.user.delete({ where: { id: created.id } });
await prisma.$disconnect();

console.log("verify-clerk-user-sync-db: OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
