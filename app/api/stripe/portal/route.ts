import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json(
      { error: "Stripe is not configured on this server." },
      { status: 503 },
    );
  }

  const user = await prisma.user.findUnique({ where: { clerkId } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Look up the most recent PURCHASE transaction to get the Stripe customer ID
  const purchaseTx = await prisma.creditTransaction.findFirst({
    where: { userId: user.id, type: "PURCHASE", stripeId: { not: null } },
    orderBy: { createdAt: "desc" },
  });

  if (!purchaseTx?.stripeId) {
    return NextResponse.json(
      { error: "No billing history found. Make a purchase first to access the billing portal." },
      { status: 400 },
    );
  }

  const Stripe = (await import("stripe")).default;
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: "2024-12-18.acacia",
  });

  // Retrieve the Stripe session to get the customer ID
  let customerId: string | null = null;
  try {
    const session = await stripe.checkout.sessions.retrieve(purchaseTx.stripeId);
    if (typeof session.customer === "string") {
      customerId = session.customer;
    } else if (session.customer && typeof session.customer === "object" && "id" in session.customer) {
      customerId = session.customer.id;
    }
  } catch {
    return NextResponse.json(
      { error: "Could not retrieve billing information. Please contact support." },
      { status: 400 },
    );
  }

  if (!customerId) {
    return NextResponse.json(
      { error: "No Stripe customer found for this account." },
      { status: 400 },
    );
  }

  const origin = request.headers.get("origin") ?? "http://localhost:3000";

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${origin}/settings`,
  });

  return NextResponse.json({ url: portalSession.url });
}
