import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { fulfillCheckoutSession, markFailed, reversePayment, stripe } from "@/lib/payments";
import { invoiceSubscriptionId, syncSubscription } from "@/lib/subscriptions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * Subscribe the endpoint (Stripe Dashboard > Developers > Webhooks) to:
 *   checkout.session.completed
 *   checkout.session.async_payment_succeeded
 *   checkout.session.async_payment_failed
 *   checkout.session.expired
 *   charge.refunded
 *   charge.dispute.created
 * and, for memberships (Pro / Max):
 *   customer.subscription.created
 *   customer.subscription.updated
 *   customer.subscription.deleted
 *   invoice.paid
 *   invoice.payment_failed
 */
export async function POST(req: NextRequest) {
  // Trim: a secret pasted into Vercel with a stray space or newline would fail every signature check.
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!stripe || !secret) return NextResponse.json({ ok: false }, { status: 400 });
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, req.headers.get("stripe-signature") ?? "", secret);
  } catch {
    return NextResponse.json({ error: "bad signature" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const s = event.data.object;
      if (s.mode === "subscription") {
        const sub = typeof s.subscription === "string" ? s.subscription : s.subscription?.id;
        if (sub) await syncSubscription(sub);
        break;
      }
      // Re-reads the session from Stripe and delivers only if it is actually paid.
      await fulfillCheckoutSession(s.id);
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await syncSubscription(event.data.object.id);
      break;
    case "invoice.paid":
    case "invoice.payment_failed": {
      const sub = invoiceSubscriptionId(event.data.object);
      if (sub) await syncSubscription(sub);
      break;
    }
    case "checkout.session.async_payment_failed":
    case "checkout.session.expired": {
      const id = event.data.object.metadata?.paymentId;
      // Subscription checkouts have no Payment row; nothing to undo.
      if (id) await markFailed(id);
      break;
    }
    case "charge.refunded": {
      const c = event.data.object;
      // Only take back a full refund. Partial refunds are a manual call (support goodwill etc.).
      const pi = typeof c.payment_intent === "string" ? c.payment_intent : c.payment_intent?.id;
      if (pi && c.refunded) await reversePayment(pi, "REFUNDED");
      break;
    }
    case "charge.dispute.created": {
      const d = event.data.object;
      const pi = typeof d.payment_intent === "string" ? d.payment_intent : d.payment_intent?.id;
      if (pi) await reversePayment(pi, "DISPUTED");
      break;
    }
  }
  return NextResponse.json({ received: true });
}
