import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { paymentsMode, stripe } from "@/lib/payments";
import { PLANS, planOf, type PlanId } from "@/lib/plans";
import { PLAN_SALES_ON } from "@/lib/flow";
import { priceIdFor, syncSubscription } from "@/lib/subscriptions";

export const runtime = "nodejs";

/*
 * One form endpoint for everything about a membership:
 *   action=start&plan=PRO|MAX   new subscription (Stripe Checkout), or switch plan if one is running
 *   action=cancel               stop at the end of the paid month
 *   action=resume               undo a cancel before the month ends
 *   action=portal               Stripe's billing page (card, invoices)
 */
export async function POST(req: NextRequest) {
  try {
    return await handle(req);
  } catch (e) {
    // Usually a Stripe key without the subscription permissions (see docs/STRIPE.md). Show a calm message, not a crash.
    console.error("subscribe", e);
    return NextResponse.redirect(new URL("/dashboard/billing?payments=off", req.url), 303);
  }
}

async function handle(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.redirect(new URL("/signup", req.url), 303);
  const f = await req.formData();
  const action = String(f.get("action") ?? "start");
  const back = (q: string) => NextResponse.redirect(new URL(`/dashboard/billing?${q}`, req.url), 303);
  const mode = paymentsMode();
  if (mode === "off") return back("payments=off");
  // Plan sales are paused: subscribers can still cancel, resume or open the billing page, but nobody starts or switches.
  if (!PLAN_SALES_ON && action === "start") return back("payments=off");
  const current = planOf(user);

  // Local test mode: no Stripe, change the plan right away.
  if (mode === "test" || !stripe) {
    if (action === "start") {
      const plan = PLANS[String(f.get("plan")) as PlanId];
      if (!plan || plan.id === "FREE") return back("");
      await db.user.update({
        where: { id: user.id },
        data: { plan: plan.id, planUntil: new Date(Date.now() + 30 * 864e5), planStatus: "active", planCancelAtPeriodEnd: false, spotlightDaysLeft: plan.spotlightDays, planPeriodStart: new Date() },
      });
      return back("plan=started");
    }
    if (action === "cancel") await db.user.update({ where: { id: user.id }, data: { plan: "FREE", planUntil: null, spotlightDaysLeft: 0 } });
    return back("");
  }

  const appUrl = process.env.APP_URL ?? new URL(req.url).origin;

  if (action === "portal") {
    if (!user.stripeCustomerId) return back("");
    try {
      const s = await stripe.billingPortal.sessions.create({ customer: user.stripeCustomerId, return_url: `${appUrl}/dashboard/billing` });
      return NextResponse.redirect(s.url, 303);
    } catch (e) {
      console.error("billing portal", e);
      return back("portal=off");
    }
  }

  if (action === "cancel" || action === "resume") {
    if (!user.stripeSubscriptionId) return back("");
    await stripe.subscriptions.update(user.stripeSubscriptionId, { cancel_at_period_end: action === "cancel" });
    await syncSubscription(user.stripeSubscriptionId);
    return back(action === "cancel" ? "plan=cancelled" : "plan=resumed");
  }

  const plan = PLANS[String(f.get("plan")) as PlanId];
  if (!plan || plan.id === "FREE") return back("");
  const price = await priceIdFor(plan);

  // Already paying: switch the running subscription instead of starting a second one.
  if (current.id !== "FREE" && user.stripeSubscriptionId) {
    if (current.id === plan.id) return back("");
    const sub = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
    const item = sub.items.data[0];
    if (sub.status !== "canceled" && item) {
      await stripe.subscriptions.update(sub.id, {
        items: [{ id: item.id, price }],
        // Upgrades charge the difference now; downgrades leave a credit on the next invoice.
        proration_behavior: "always_invoice",
        cancel_at_period_end: false,
        metadata: { userId: user.id, plan: plan.id },
      });
      await syncSubscription(sub.id);
      return back("plan=changed");
    }
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    ...(user.stripeCustomerId ? { customer: user.stripeCustomerId } : { customer_email: user.email }),
    client_reference_id: user.id,
    line_items: [{ price, quantity: 1 }],
    subscription_data: { metadata: { userId: user.id, plan: plan.id } },
    metadata: { userId: user.id, plan: plan.id, kind: "SUBSCRIPTION" },
    allow_promotion_codes: true,
    success_url: `${appUrl}/dashboard/billing?sub_session={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/pricing`,
  });
  return NextResponse.redirect(session.url!, 303);
}
