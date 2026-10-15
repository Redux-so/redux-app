/**
 * SEC-07 manual QA for Clerk → Prisma user sync helpers (no DB required).
 * Run: pnpm exec tsx scripts/verify-clerk-user-sync.ts
 */
import assert from "node:assert/strict";
import {
  displayNameFromClerkParts,
  pendingClerkSyncEmail,
  primaryEmailFromWebhookAddresses,
  tombstoneClerkIdentity,
} from "../lib/clerk-user-profile";
import { clerkProfileFromWebhookPayload } from "../lib/require-user";

const primaryId = "idn_primary";
const secondaryId = "idn_secondary";

assert.equal(
  primaryEmailFromWebhookAddresses(
    [
      { id: secondaryId, email_address: "secondary@example.com" },
      { id: primaryId, email_address: "primary@example.com" },
    ],
    primaryId,
  ),
  "primary@example.com",
);

assert.equal(
  primaryEmailFromWebhookAddresses(
    [{ id: secondaryId, email_address: "only@example.com" }],
    null,
  ),
  "only@example.com",
);

assert.equal(displayNameFromClerkParts("Ada", "Lovelace"), "Ada Lovelace");
assert.equal(displayNameFromClerkParts(null, null), null);

const profile = clerkProfileFromWebhookPayload({
  id: "user_abc",
  email_addresses: [
    { id: secondaryId, email_address: "old@example.com" },
    { id: primaryId, email_address: "primary@example.com" },
  ],
  primary_email_address_id: primaryId,
  first_name: "Test",
  last_name: "User",
});

assert.equal(profile.email, "primary@example.com");
assert.equal(profile.name, "Test User");
assert.equal(profile.clerkId, "user_abc");

assert.match(pendingClerkSyncEmail("user_xyz"), /^pending\+user_xyz@/);

const tombstone = tombstoneClerkIdentity("cm123");
assert.equal(tombstone.clerkId, "deleted_cm123");
assert.match(tombstone.email, /^deleted\+cm123@/);

console.log("verify-clerk-user-sync: OK");
