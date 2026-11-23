import Link from "next/link";
import { CREDITS_ON, PLAN_SALES_ON } from "@/lib/flow";
import { ArrowRight } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { CREDIT_PACKS, fmt } from "@/lib/money";
import { checkoutNotice, paymentsMode, stripe, stripeTestKey } from "@/lib/payments";
import { CREDIT_PACKS_ON, planOf } from "@/lib/plans";
import { syncSubscription } from "@/lib/subscriptions";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pending",
  PAID: "Paid",
  FAILED: "Not completed",
  REFUNDED: "Refunded",
  DISPUTED: "Disputed",
};

const PLAN_NOTICE: Record<string, string> = {
  started: "Welcome aboard. Your plan is active.",
  changed: "Plan changed.",
  cancelled: "Your plan won't renew. You keep it until the end of this month.",
  resumed: "Your plan will renew as usual.",
};

/** Back from Stripe Checkout: copy the new subscription onto the account now, even if the webhook is still on its way. */
async function syncFromCheckout(sessionId: string | undefined, userId: string) {
  if (!sessionId || !stripe) return false;
  try {
    const s = await stripe.checkout.sessions.retrieve(sessionId);
    if (s.metadata?.userId !== userId || s.mode !== "subscription" || !s.subscription) return false;
    await syncSubscription(typeof s.subscription === "string" ? s.subscription : s.subscription.id);
    return true;
  } catch {
    return false;
  }
}

export default async function Billing({ searchParams }: { searchParams: Promise<{ paid?: string; session_id?: string; payments?: string; sub_session?: string; plan?: string; portal?: string }> }) {
  const sessionUser = await requireUser();
  const q = await searchParams;
  // Runs before reading the user/payments so a just-paid purchase is already counted below.
  const notice = await checkoutNotice(q, sessionUser.id);
  const justSubscribed = await syncFromCheckout(q.sub_session, sessionUser.id);
  const mode = paymentsMode();
  const user = (await db.user.findUnique({ where: { id: sessionUser.id } })) ?? sessionUser;
  const plan = planOf(user);
  const payments = await db.payment.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 20, include: { game: true } });
  const best = CREDIT_PACKS[CREDIT_PACKS.length - 1].id;
  const planNotice = justSubscribed ? PLAN_NOTICE.started : PLAN_NOTICE[q.plan ?? ""];
  const renews = user.planUntil?.toISOString().slice(0, 10);

  return (
    <div className="mx-auto max-w-3xl space-y-12">
      <section>
        <p className="eyebrow">Plan &amp; billing</p>
        <h1 className="mt-1 page-title">{plan.name} plan</h1>
        {planNotice && <p role="status" className="mt-3 text-sm text-verified">{planNotice}</p>}
        {q.sub_session && !justSubscribed && plan.id === "FREE" && <p className="mt-3 text-sm text-mute">Payment is processing. Your plan turns on as soon as Stripe confirms it.</p>}
        {(q.payments === "off" || mode === "off") && PLAN_SALES_ON && <p className="mt-3 text-sm text-mute">Paid plans aren&apos;t open yet.</p>}
        {q.portal === "off" && <p className="mt-3 text-sm text-mute">The billing page isn&apos;t available right now. Contact us and we&apos;ll help.</p>}
        {mode === "test" && <p className="mt-3 text-xs text-mute">Test mode: plans are free and instant.</p>}
        {mode === "stripe" && stripeTestKey && <p className="mt-3 text-xs text-mute">Stripe test mode: pay with card 4242 4242 4242 4242, any future date, any CVC.</p>}

        {plan.id === "FREE" && !PLAN_SALES_ON ? (
          <p className="mt-4 max-w-prose text-mute">Spawnswap is free. There are no paid plans right now.</p>
        ) : plan.id === "FREE" ? (
          <div className="mt-4 space-y-4">
            <p className="max-w-prose text-mute">You&apos;re on Free: up to {plan.maxGames} games, players from the credits you earn. Pro and Max put your games first and add homepage spotlight days every month.</p>
            <Link href="/pricing" className="btn">See plans <ArrowRight className="h-4 w-4" /></Link>
          </div>
        ) : (
          <div className="mt-4 space-y-5">
            <dl className="grid max-w-xl grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
              <div><dt className="text-mute">Price</dt><dd className="font-semibold tabular-nums">{fmt(plan.cents)} / month</dd></div>
              <div><dt className="text-mute">{user.planCancelAtPeriodEnd ? "Ends on" : "Renews on"}</dt><dd className="font-semibold tabular-nums">{renews ?? "—"}</dd></div>
              <div><dt className="text-mute">Spotlight days left</dt><dd className="font-semibold tabular-nums">{user.spotlightDaysLeft} of {plan.spotlightDays}</dd></div>
            </dl>
            {user.planStatus === "past_due" && <p className="text-sm text-danger">Your last payment didn&apos;t go through. Update your card to keep your plan.</p>}
            <p className="max-w-prose text-sm text-mute">Use spotlight days on a game&apos;s page under &ldquo;Spotlight on the homepage&rdquo;.</p>
            <div className="flex flex-wrap gap-3">
              {PLAN_SALES_ON && <Link href="/pricing" className="btn-quiet">Change plan</Link>}
              {user.stripeCustomerId && (
                <form action="/api/subscribe" method="post">
                  <input type="hidden" name="action" value="portal" />
                  <button className="btn-quiet">Card &amp; invoices</button>
                </form>
              )}
              <form action="/api/subscribe" method="post">
                <input type="hidden" name="action" value={user.planCancelAtPeriodEnd ? "resume" : "cancel"} />
                <button className="btn-quiet text-mute">{user.planCancelAtPeriodEnd ? "Keep my plan" : "Cancel plan"}</button>
              </form>
            </div>
          </div>
        )}
      </section>

      {CREDITS_ON && <section>
        <h2 className="text-lg font-bold">Credits</h2>
        <p className="mt-1 text-mute">You have <b className="text-cream tabular-nums">{user.credits}</b>. 1 credit = 1 real player for your game.</p>
        <p className="mt-1 text-sm text-mute">Earn them by playing other games for 10 minutes. <Link href="/#earn-title" className="text-lime underline-offset-4 hover:underline">Play &amp; earn</Link></p>
        {notice === "paid" && <p className="mt-3 text-sm text-verified">Payment received.</p>}
        {notice === "processing" && <p className="mt-3 text-sm text-mute">Payment is processing. It shows up here as soon as Stripe confirms it.</p>}
        {CREDIT_PACKS_ON && (
          <form action="/api/checkout" method="post" className="mt-5 grid gap-3 sm:grid-cols-3">
            <input type="hidden" name="kind" value="CREDITS" />
            {CREDIT_PACKS.map((p) => (
              <button
                key={p.id}
                name="pack"
                value={p.id}
                className={`relative rounded-media border p-5 text-left transition active:scale-[.98] ${p.id === best ? "border-lime/60" : "border-line hover:border-mute"}`}
              >
                <div className="font-display text-3xl font-bold tabular-nums">{p.credits}</div>
                <div className="text-sm text-mute">players</div>
                <div className="mt-4 text-lg font-semibold">{fmt(p.cents)}</div>
              </button>
            ))}
          </form>
        )}
      </section>}

      {payments.length > 0 && (
        <section>
          <h2 className="mb-2 text-lg font-bold">Past purchases</h2>
          <ul className="divide-y divide-line border-y border-line text-sm">
            {payments.map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-2.5">
                <span className="w-24 text-mute tabular-nums">{p.createdAt.toISOString().slice(0, 10)}</span>
                <span className="min-w-0 flex-1 truncate">{p.kind === "CREDITS" ? `${p.credits} credits` : `Spotlight ${p.days}d · ${p.game?.name ?? ""}`}</span>
                <span className="tabular-nums">{fmt(p.amountCents)}</span>
                <span className={p.status === "PAID" ? "text-verified" : "text-mute"}>{STATUS_LABEL[p.status] ?? p.status}</span>
              </li>
            ))}
          </ul>
          {user.stripeCustomerId && <p className="mt-2 text-xs text-faint">Plan invoices are under &ldquo;Card &amp; invoices&rdquo;.</p>}
        </section>
      )}
    </div>
  );
}
