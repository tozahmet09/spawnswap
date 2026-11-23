import { db } from "@/lib/db";
import { planOf } from "@/lib/plans";

/**
 * Every live game that hasn't been in a video yet, in the order we play them:
 * Max members first (their plan perk), then the oldest game first.
 */
export async function videoQueue() {
  const games = await db.game.findMany({
    where: { hiddenAt: null, seriesTestedAt: null },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, createdAt: true, tiktokHandle: true, owner: { select: { displayName: true, plan: true, planUntil: true } } },
  });
  return games.sort((a, b) => Number(planOf(b.owner).seriesPriority) - Number(planOf(a.owner).seriesPriority));
}

/** Game id -> place in line (1 = next). */
export async function queuePositions() {
  return new Map((await videoQueue()).map((g, i) => [g.id, i + 1]));
}
