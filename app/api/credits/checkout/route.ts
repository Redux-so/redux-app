import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuthUser } from "@/lib/require-user";
import { checkoutBodySchema, parseJsonRequest } from "@/lib/api-validation";
import { CREDIT_PURCHASES_UNAVAILABLE } from "@/constants/credits";
import { creditPurchasesEnabled } from "@/lib/credit-purchases";

function logCheckoutError(label: string, err: unknown) {
  console.error(`[credits/checkout] ${label}:`, err);
  if (err instanceof Error) {
    console.error(`[credits/checkout] ${label} message:`, err.message);
    console.error(`[credits/checkout] ${label} stack:`, err.stack);
  }
  if (typeof err === "object" && err !== null) {
    const e = err as Record<string, unknown>;
    if ("type" in e) console.error(`[credits/checkout] ${label} type:`, e.type);
    if ("code" in e) console.error(`[credits/checkout] ${label} code:`, e.code);
    if ("param" in e) console.error(`[credits/checkout] ${label} param:`, e.param);
    if ("raw" in e) console.error(`[credits/checkout] ${label} raw:`, e.raw);
  }
}

export async function POST(request: Request) {
  try {
    const authResult = await requireAuthUser();
    if ("error" in authResult) {
      return authResult.error;
    }
    const { user } = authResult;

    if (!creditPurchasesEnabled()) {
      return NextResponse.json({ error: CREDIT_PURCHASES_UNAVAILABLE }, { status: 403 });
    }

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      console.error(
        "[credits/checkout] STRIPE_SECRET_KEY is missing — set it in the environment to enable checkout.",
      );
      return NextResponse.json(
        { error: "Stripe is not configured on this server." },
        { status: 503 },
      );
    }

    const parsed = await parseJsonRequest(request, checkoutBodySchema);
    if (!parsed.ok) {
      logCheckoutError("Invalid request body", parsed.response);
      return parsed.response;
    }
    const { bundleId } = parsed.data;

    const bundle = await prisma.creditBundle.findFirst({
      where: { id: bundleId, isActive: true },
    });
    if (!bundle) {
      return NextResponse.json({ error: "Bundle not found" }, { status: 404 });
    }

    if (!bundle.stripePriceId) {
      console.error(
        "[credits/checkout] Bundle has no stripePriceId:",
        bundle.id,
      );
      return NextResponse.json(
        { error: "Bundle is missing Stripe price configuration." },
        { status: 500 },
      );
    }

      const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
    if (!appUrl) {
      console.error(
        "[credits/checkout] NEXT_PUBLIC_APP_URL is missing — cannot build checkout redirect URLs.",
      );
      return NextResponse.json(
        { error: "App URL is not configured on this server." },
        { status: 503 },
      );
    }

    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: "2026-02-25.clover",
    });

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [{ price: bundle.stripePriceId, quantity: 1 }],
      success_url: `${appUrl}/library`,
      cancel_url: `${appUrl}/settings`,
      metadata: { userId: user.id, bundleId: bundle.id },
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    logCheckoutError("Checkout session creation failed", err);
    return NextResponse.json(
      { error: "Checkout failed. Check server logs for details." },
      { status: 500 },
    );
  }
}
