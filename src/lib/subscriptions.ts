import "server-only";
import type Stripe from "stripe";
import { db } from "./db";
import { stripe } from "./payments";
import { PLANS, type Plan, type PlanId } from "./plans";

/**
 * Monthly Stripe Price for a plan. Found by its lookup key; created (with its Product) the first time,
 * so nothing has to be set up by hand in the Stripe Dashboard.
 * If the price in plans.ts changes, a new Price takes over the lookup key (existing subscribers keep theirs).
 */
export async function priceIdFor(plan: Plan) {
  if (!stripe || !plan.lookupKey) throw new Error("no stripe");
  const found = await stripe.prices.list({ lookup_keys: [plan.lookupKey], active: true, limit: 1 });
  const p = found.data[0];
  if (p && p.unit_amount === plan.cents && p.currency === "usd" && p.recurring?.interval === "month") return p.id;
  const created = await stripe.prices.create({
    currency: "usd",
    unit_amount: plan.cents,
    recurring: { interval: "month" },
    lookup_key: plan.lookupKey,
    transfer_lookup_key: true,
    product_data: { name: `Spawnswap ${plan.name}` },
    metadata: { plan: plan.id },
  });
  return created.id;
}

/** Which of our plans a Stripe subscription is for. */
function planFromSubscription(sub: Stripe.Subscription): PlanId | null {
  const price = sub.items.data[0]?.price;
  const byKey = Object.values(PLANS).find((p) => p.lookupKey && p.lookupKey === price?.lookup_key);
  if (byKey) return byKey.id;
  const meta = (price?.metadata?.plan ?? sub.metadata?.plan) as PlanId | undefined;
  return meta && meta in PLANS && meta !== "FREE" ? meta : null;
}

const LIVE = new Set(["active", "trialing", "past_due"]);

/**
 * Copies a subscription's state from Stripe onto the user. Safe to call many times, from any event.
 * Always re-reads the subscription from Stripe, so an old or out-of-order event can't set a wrong plan.
 * A new billing period (or an upgrade) refills the monthly spotlight days.
 */
export async function syncSubscription(subOrId: string | Stripe.Subscription) {
  if (!stripe) return;
  const id = typeof subOrId === "string" ? subOrId : subOrId.id;
  const sub = await stripe.subscriptions.retrieve(id);
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const user =
    (sub.metadata?.userId && (await db.user.findUnique({ where: { id: sub.metadata.userId } }))) ||
    (await db.user.findFirst({ where: { OR: [{ stripeSubscriptionId: sub.id }, { stripeCustomerId: customerId }] } }));
  if (!user) {
    console.error(`Stripe subscription ${sub.id} has no matching user`);
    return;
  }
  // A user who already moved to a newer subscription ignores events about an older one.
  if (user.stripeSubscriptionId && user.stripeSubscriptionId !== sub.id && !LIVE.has(sub.status)) return;

  const item = sub.items.data[0];
  const periodEnd = item?.current_period_end ? new Date(item.current_period_end * 1000) : null;
  const periodStart = item?.current_period_start ? new Date(item.current_period_start * 1000) : null;
  const planId = LIVE.has(sub.status) ? planFromSubscription(sub) : null;

  if (!planId) {
    await db.user.update({
      where: { id: user.id },
      data: {
        plan: "FREE",
        planUntil: null,
        planStatus: sub.status,
        planCancelAtPeriodEnd: false,
        spotlightDaysLeft: 0,
        stripeCustomerId: customerId,
        ...(user.stripeSubscriptionId === sub.id || !user.stripeSubscriptionId ? { stripeSubscriptionId: null } : {}),
      },
    });
    return;
  }

  const allowance = PLANS[planId].spotlightDays;
  let spotlight = user.spotlightDaysLeft;
  const newPeriod = !!periodStart && periodStart.getTime() !== user.planPeriodStart?.getTime();
  // Only a paid (active) period gives days; a period whose payment failed (past_due) doesn't.
  if (newPeriod && sub.status !== "past_due") spotlight = allowance;
  else if (user.plan !== planId) spotlight = PLANS[user.plan as PlanId]?.spotlightDays > allowance ? Math.min(spotlight, allowance) : Math.max(spotlight, allowance);

  await db.user.update({
    where: { id: user.id },
    data: {
      plan: planId,
      planUntil: periodEnd,
      planStatus: sub.status,
      planCancelAtPeriodEnd: !!sub.cancel_at_period_end || !!sub.cancel_at,
      planPeriodStart: newPeriod && sub.status === "past_due" ? user.planPeriodStart : periodStart,
      spotlightDaysLeft: spotlight,
      stripeCustomerId: customerId,
      stripeSubscriptionId: sub.id,
    },
  });
}

/** Subscription id from an invoice (newer API puts it under parent.subscription_details). */
export function invoiceSubscriptionId(inv: Stripe.Invoice) {
  const s = inv.parent?.subscription_details?.subscription ?? (inv as unknown as { subscription?: string | { id: string } }).subscription;
  return typeof s === "string" ? s : s?.id ?? null;
}
