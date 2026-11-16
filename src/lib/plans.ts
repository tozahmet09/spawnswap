// Membership plans. Paid plans sell visibility and tools, never players:
// credits (= real players) are only earned by playing, so we never sell more players than the site has.

export type PlanId = "FREE" | "PRO" | "MAX";

export type Plan = {
  id: PlanId;
  name: string;
  cents: number; // per month
  /** Games you can add (archived ones count too). Infinity = no limit. */
  maxGames: number;
  /** Free homepage spotlight days every month. Not carried over. */
  spotlightDays: number;
  /** Shown first in "Play & earn" with a badge. */
  priority: boolean;
  /** Listed at the top of "All games". */
  topOfAll: boolean;
  /** Detailed stats on the game dashboard. */
  stats: boolean;
  /** First in line for ahmet's "testing games on SpawnSwap" video series. */
  seriesPriority: boolean;
  blurb: string;
  perks: string[];
  /** Stripe Price lookup key. The Price is created on first use (see src/lib/subscriptions.ts). */
  lookupKey?: string;
};

export const PLANS: Record<PlanId, Plan> = {
  FREE: {
    id: "FREE",
    name: "Free",
    cents: 0,
    maxGames: 2,
    spotlightDays: 0,
    priority: false,
    topOfAll: false,
    stats: false,
    seriesPriority: false,
    blurb: "Play games, earn credits, get real players.",
    perks: ["Play & earn credits", "1 credit = 1 real player", "Up to 2 games", "Ratings and feedback from players"],
  },
  PRO: {
    id: "PRO",
    name: "Pro",
    cents: 500,
    maxGames: 10,
    spotlightDays: 3,
    priority: true,
    topOfAll: false,
    stats: true,
    seriesPriority: false,
    blurb: "Get your game seen first.",
    perks: ["Everything in Free", "3 spotlight days on the homepage every month", "Shown first in Play & earn", "Pro badge on your games", "Detailed stats for every game", "Up to 10 games"],
    lookupKey: "spawnswap_pro_monthly",
  },
  MAX: {
    id: "MAX",
    name: "Max",
    cents: 1200,
    maxGames: Infinity,
    spotlightDays: 7,
    priority: true,
    topOfAll: true,
    stats: true,
    seriesPriority: true,
    blurb: "The most reach for serious launches.",
    perks: ["Everything in Pro", "7 spotlight days on the homepage every month", "Top of All games", "Max badge on your games", "Priority in our TikTok game-testing series", "Unlimited games"],
    lookupKey: "spawnswap_max_monthly",
  },
};

export const PAID_PLANS = [PLANS.PRO, PLANS.MAX];

/** If a renewal webhook is late, keep the plan this long past the period end before falling back to Free. */
const GRACE_MS = 3 * 864e5;

/** The plan that applies right now. Anything unpaid or expired is Free. */
export function planOf(u: { plan?: string | null; planUntil?: Date | null } | null | undefined): Plan {
  if (!u || !u.plan || u.plan === "FREE" || !(u.plan in PLANS)) return PLANS.FREE;
  if (!u.planUntil || u.planUntil.getTime() + GRACE_MS < Date.now()) return PLANS.FREE;
  return PLANS[u.plan as PlanId];
}

/** Badge shown on game cards for paid plans. */
export function planBadge(u: Parameters<typeof planOf>[0]): "PRO" | "MAX" | undefined {
  const p = planOf(u).id;
  return p === "FREE" ? undefined : p;
}

/** Sort weight: Max first, then Pro, then Free. */
export function planRank(u: Parameters<typeof planOf>[0]) {
  return { MAX: 2, PRO: 1, FREE: 0 }[planOf(u).id];
}

/** Credit packs are hidden until there are enough players to deliver them. Flip to true to sell them again. */
export const CREDIT_PACKS_ON = false;

/** One-time paid spotlight ($3/$7/$10) is off: spotlight now only comes with Pro / Max days. Spotlights already paid for keep running. */
export const FEATURED_SALES_ON = false;
