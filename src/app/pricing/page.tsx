import Link from "next/link";
import { Check } from "lucide-react";
import { getUser } from "@/lib/auth";
import { fmt } from "@/lib/money";
import { PLANS, planOf, type Plan } from "@/lib/plans";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Pricing",
  description: "Spawnswap is free: play games, earn credits, get real players. Pro and Max put your Roblox game in front of more players.",
};

export default async function Pricing() {
  const user = await getUser();
  const current = user ? planOf(user) : null;

  return (
    <div className="space-y-12">
      <div className="mx-auto max-w-2xl text-center">
        <p className="eyebrow">Pricing</p>
        <h1 className="mt-2 page-title">Free to start. Pay to get seen.</h1>
        <p className="mt-3 text-mute">
          Players always come from credits you earn by playing, on every plan. Pro and Max put your game where players look first.
        </p>
      </div>

      <div className="mx-auto grid max-w-5xl gap-4 md:grid-cols-3">
        {[PLANS.FREE, PLANS.PRO, PLANS.MAX].map((p) => (
          <Column key={p.id} plan={p} popular={p.id === "PRO"} loggedIn={!!user} current={current?.id === p.id} paying={!!current && current.id !== "FREE"} />
        ))}
      </div>

      <div className="mx-auto max-w-2xl space-y-5 text-sm text-mute">
        <h2 className="text-lg font-bold text-cream">Questions</h2>
        <Faq q="Do paid plans give me players?">
          No plan sells players. Every player comes from a credit, and credits are earned by playing other games for 10 minutes. Paid plans put your game first, so more of those players pick it.
        </Faq>
        <Faq q="What is a spotlight day?">
          One day at the top of the homepage. Your game needs a trailer. Days refill every month and don&apos;t carry over.
        </Faq>
        <Faq q="Can I cancel?">
          Any time, from Plan &amp; billing. You keep your plan until the end of the month you paid for, then you&apos;re back on Free. Your games and credits stay.
        </Faq>
        <Faq q="Can I switch between Pro and Max?">
          Yes. Upgrading charges the difference for the rest of the month. Downgrading leaves the difference as credit on your next bill.
        </Faq>
      </div>
    </div>
  );
}

function Column({ plan, popular, loggedIn, current, paying }: { plan: Plan; popular: boolean; loggedIn: boolean; current: boolean; paying: boolean }) {
  return (
    <div className={`relative flex flex-col rounded-media border p-6 ${popular ? "border-lime/60 bg-panel/60 shadow-glow" : "border-line bg-navy-deep/40"}`}>
      {popular && <span className="chip absolute right-4 top-4 bg-lime text-navy">Most popular</span>}
      <h2 className="font-display text-xl font-bold">{plan.name}</h2>
      <p className="mt-1 text-sm text-mute">{plan.blurb}</p>
      <div className="mt-5 flex items-baseline gap-1">
        <span className="font-display text-4xl font-extrabold tabular-nums">{plan.cents ? fmt(plan.cents).replace(".00", "") : "$0"}</span>
        <span className="text-sm text-mute">/ month</span>
      </div>
      <div className="mt-5">
        {current ? (
          <Link href="/dashboard/billing" className="btn-quiet w-full justify-center">Your plan</Link>
        ) : plan.id === "FREE" ? (
          loggedIn ? (
            paying ? <Link href="/dashboard/billing" className="btn-quiet w-full justify-center">Manage plan</Link> : null
          ) : (
            <Link href="/signup" className="btn-quiet w-full justify-center">Sign up free</Link>
          )
        ) : loggedIn ? (
          <form action="/api/subscribe" method="post">
            <input type="hidden" name="action" value="start" />
            <input type="hidden" name="plan" value={plan.id} />
            <button className={`${popular ? "btn" : "btn-quiet"} w-full justify-center`}>{paying ? `Switch to ${plan.name}` : `Get ${plan.name}`}</button>
          </form>
        ) : (
          <Link href="/signup" className={`${popular ? "btn" : "btn-quiet"} w-full justify-center`}>Get {plan.name}</Link>
        )}
      </div>
      <ul className="mt-6 space-y-2.5 text-sm">
        {plan.perks.map((perk) => (
          <li key={perk} className="flex gap-2">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-lime" aria-hidden />
            <span>{perk}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-line pt-4">
      <h3 className="font-semibold text-cream">{q}</h3>
      <p className="mt-1">{children}</p>
    </div>
  );
}
