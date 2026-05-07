import { prisma } from "@/lib/prisma";
import type Stripe from "stripe";

export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

  if (!webhookSecret || !stripeSecretKey) {
    console.error(
      "[stripe/webhook] Missing STRIPE_WEBHOOK_SECRET or STRIPE_SECRET_KEY",
    );
    return new Response("Webhook not configured", { status: 503 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    console.error("[stripe/webhook] Missing stripe-signature header");
    return new Response("Missing stripe-signature", { status: 400 });
  }

  const StripeSdk = (await import("stripe")).default;
  const stripe = new StripeSdk(stripeSecretKey, {
    apiVersion: "2026-02-25.clover",
  });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error("[stripe/webhook] Signature verification failed:", err);
    return new Response("Invalid signature", { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;

      if (session.mode !== "payment" || session.payment_status !== "paid") {
        return new Response(null, { status: 200 });
      }

      const userId = session.metadata?.userId;
      const bundleId = session.metadata?.bundleId;
      if (!userId || !bundleId) {
        console.error(
          "[stripe/webhook] checkout.session.completed missing userId or bundleId in metadata",
          session.id,
        );
        return new Response(null, { status: 200 });
      }

      const alreadyProcessed = await prisma.creditTransaction.findFirst({
        where: { type: "PURCHASE", stripeId: session.id },
      });
      if (alreadyProcessed) {
        return new Response(null, { status: 200 });
      }

      const bundle = await prisma.creditBundle.findFirst({
        where: { id: bundleId, isActive: true },
      });
      if (!bundle) {
        console.error("[stripe/webhook] Bundle not found or inactive:", bundleId);
        return new Response(null, { status: 200 });
      }

      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        console.error("[stripe/webhook] User not found:", userId);
        return new Response(null, { status: 200 });
      }

      await prisma.$transaction([
        prisma.user.update({
          where: { id: userId },
          data: { creditBalance: { increment: bundle.credits } },
        }),
        prisma.creditTransaction.create({
          data: {
            userId,
            type: "PURCHASE",
            amount: bundle.credits,
            bundleId: bundle.id,
            stripeId: session.id,
            description: `Purchased ${bundle.name} (${bundle.credits} credits)`,
          },
        }),
      ]);
    }
  } catch (err) {
    console.error("[stripe/webhook] Handler error:", err);
    if (err instanceof Error) {
      console.error("[stripe/webhook] Stack:", err.stack);
    }
    return new Response("Webhook handler failed", { status: 500 });
  }

  return new Response(null, { status: 200 });
}
