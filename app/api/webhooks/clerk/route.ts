// PUBLIC: verified via Svix webhook signature (CLERK_WEBHOOK_SECRET)
import { headers } from "next/headers";
import { Webhook, WebhookVerificationError } from "svix/dist/webhook";
import { upsertPrismaUser } from "@/lib/ensure-prisma-user";
import { clerkProfileFromWebhookPayload } from "@/lib/require-user";

interface ClerkEmailAddress {
  email_address: string;
  id: string;
}

interface ClerkUserPayload {
  id: string;
  email_addresses: ClerkEmailAddress[];
  first_name: string | null;
  last_name: string | null;
}

interface WebhookEvent {
  type: string;
  data: ClerkUserPayload;
}

export async function POST(request: Request) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    return new Response("Missing CLERK_WEBHOOK_SECRET", { status: 500 });
  }

  const headersList = await headers();
  const svixHeaders = {
    "svix-id": headersList.get("svix-id") ?? "",
    "svix-timestamp": headersList.get("svix-timestamp") ?? "",
    "svix-signature": headersList.get("svix-signature") ?? "",
  };

  const body = await request.text();

  let event: WebhookEvent;
  try {
    const wh = new Webhook(secret);
    event = wh.verify(body, svixHeaders) as WebhookEvent;
  } catch (err) {
    if (err instanceof WebhookVerificationError) {
      return new Response("Invalid webhook signature", { status: 400 });
    }
    return new Response("Webhook verification failed", { status: 400 });
  }

  const { type, data } = event;

  if (type === "user.created" || type === "user.updated") {
    await upsertPrismaUser(clerkProfileFromWebhookPayload(data));
  }

  return new Response("OK", { status: 200 });
}
