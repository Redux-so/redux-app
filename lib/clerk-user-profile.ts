/** Clerk email row shape in Svix webhook payloads. */
export type ClerkWebhookEmailAddress = {
  id: string;
  email_address: string;
};

export type ClerkWebhookUserData = {
  id: string;
  email_addresses: ClerkWebhookEmailAddress[];
  primary_email_address_id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
};

/** Resolve the verified primary email from a Clerk webhook user payload. */
export function primaryEmailFromWebhookAddresses(
  emailAddresses: ClerkWebhookEmailAddress[],
  primaryEmailAddressId: string | null | undefined,
): string {
  if (primaryEmailAddressId) {
    const match = emailAddresses.find((row) => row.id === primaryEmailAddressId);
    if (match?.email_address) {
      return match.email_address;
    }
  }
  return emailAddresses[0]?.email_address ?? "";
}

export function displayNameFromClerkParts(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
): string | null {
  const name = [firstName, lastName].filter(Boolean).join(" ");
  return name.length > 0 ? name : null;
}

/** Fallback email when Clerk has not attached a primary address yet (unique per clerkId). */
export function pendingClerkSyncEmail(clerkId: string): string {
  return `pending+${clerkId}@clerk-sync.redux.invalid`;
}

/** Tombstone values after `user.deleted` — frees unique clerkId/email for re-registration. */
export function tombstoneClerkIdentity(userId: string): {
  clerkId: string;
  email: string;
} {
  return {
    clerkId: `deleted_${userId}`,
    email: `deleted+${userId}@users.redux.invalid`,
  };
}
