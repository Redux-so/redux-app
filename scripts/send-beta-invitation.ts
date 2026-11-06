import { createClerkClient } from "@clerk/nextjs/server";
import { z } from "zod";

async function main() {
  const [email, signInUrl, ...extra] = process.argv.slice(2);
  if (!z.string().email().safeParse(email).success || !signInUrl || extra.length) {
    throw new Error("Usage: pnpm exec tsx scripts/send-beta-invitation.ts <email> <Redux sign-in URL>");
  }

  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) throw new Error("Set CLERK_SECRET_KEY for the Clerk instance serving this deployment.");

  const destination = new URL(signInUrl);
  if (destination.protocol !== "https:" || !destination.pathname.endsWith("/sign-in") ||
      destination.username || destination.password || destination.search || destination.hash) {
    throw new Error("Use the deployed Redux HTTPS sign-in URL without query parameters.");
  }

  const clerk = createClerkClient({ secretKey });
  const invitation = await clerk.invitations.createInvitation({
    emailAddress: email,
    redirectUrl: destination.href,
    notify: true,
  });
  console.log(`Clerk created invitation ${invitation.id} and requested email delivery.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Invitation failed.");
  if (error && typeof error === "object" && "errors" in error && Array.isArray(error.errors)) {
    for (const detail of error.errors) {
      const message = detail?.longMessage ?? detail?.message;
      if (typeof message === "string") console.error(message);
    }
  }
  process.exitCode = 1;
});
