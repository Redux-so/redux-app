// PUBLIC: verified via Svix webhook signature (CLERK_WEBHOOK_SECRET)
import { headers } from "next/headers";
import { Webhook, WebhookVerificationError } from "svix/dist/webhook";
import type { ClerkWebhookUserData } from "@/lib/clerk-user-profile";
import {
  tombstonePrismaUserByClerkId,
  upsertPrismaUser,
} from "@/lib/ensure-prisma-user";
import { clerkProfileFromWebhookPayload } from "@/lib/require-user";

interface WebhookEvent {
  type: string;
  data: ClerkWebhookUserData;
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

  switch (type) {
    case "user.created":
    case "user.updated":
      await upsertPrismaUser(clerkProfileFromWebhookPayload(data));
      break;
    case "user.deleted":
      await tombstonePrismaUserByClerkId(data.id);
      break;
    default:
      break;
  }

  return new Response("OK", { status: 200 });
}
