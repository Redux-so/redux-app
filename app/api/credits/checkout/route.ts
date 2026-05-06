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

  const { bundleId } = (await request.json()) as { bundleId?: string };
  if (!bundleId) {
    return NextResponse.json({ error: "bundleId is required" }, { status: 400 });
  }

  const bundle = await prisma.creditBundle.findFirst({
    where: { id: bundleId, isActive: true },
  });
  if (!bundle) {
    return NextResponse.json({ error: "Bundle not found" }, { status: 404 });
  }

  const user = await prisma.user.findUnique({ where: { clerkId } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const Stripe = (await import("stripe")).default;
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: "2024-12-18.acacia",
  });

  const origin = request.headers.get("origin") ?? "http://localhost:3000";

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [{ price: bundle.stripePriceId, quantity: 1 }],
    success_url: `${origin}/library?purchase=success`,
    cancel_url: `${origin}/library?purchase=cancelled`,
    metadata: { userId: user.id, bundleId: bundle.id },
  });

  return NextResponse.json({ url: session.url });
}
