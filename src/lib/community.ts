import "server-only";
import { randomBytes } from "crypto";
import { db } from "./db";
import { gameScore } from "./score";

/** The user's invite code, created the first time it's needed. */
export async function ensureReferralCode(userId: string) {
  const u = await db.user.findUnique({ where: { id: userId }, select: { referralCode: true } });
  if (u?.referralCode) return u.referralCode;
  for (let i = 0; i < 5; i++) {
    const code = randomBytes(4).toString("base64url").replace(/[-_]/g, "x").slice(0, 6).toLowerCase();
    if (await db.user.findFirst({ where: { referralCode: code }, select: { id: true } })) continue;
    await db.user.update({ where: { id: userId }, data: { referralCode: code } });
    return code;
  }
  throw new Error("could not create invite code");
}

const since = (days: number) => new Date(Date.now() - days * 864e5);

/**
 * Games ranked by score (average stars as 0-100), Metacritic style. Games with fewer than
 * MIN_RATINGS ratings have no score yet and are listed after the ranked ones ("TBD").
 */
export async function topGames(take = 50) {
  const [ratingRows, timeRows] = await Promise.all([
    db.playTask.groupBy({ by: ["gameId"], where: { status: "COMPLETED", rating: { not: null } }, _avg: { rating: true }, _count: { rating: true } }),
    db.playTask.groupBy({ by: ["gameId"], where: { playedSeconds: { gt: 0 } }, _sum: { playedSeconds: true } }),
  ]);
  const ratings = new Map(ratingRows.map((r) => [r.gameId, { avg: r._avg.rating ?? 0, count: r._count.rating }]));
  const seconds = new Map(timeRows.map((r) => [r.gameId, r._sum.playedSeconds ?? 0]));
  const ids = [...new Set([...ratings.keys(), ...timeRows.filter((r) => (r._sum.playedSeconds ?? 0) >= 60).map((r) => r.gameId)])];
  const games = await db.game.findMany({ where: { id: { in: ids }, hiddenAt: null }, select: { id: true, name: true, genre: true, iconUrl: true } });
  return games
    .map((g) => {
      const r = ratings.get(g.id);
      return { ...g, rating: r?.avg ?? null, ratings: r?.count ?? 0, score: gameScore(r?.avg, r?.count ?? 0), seconds: seconds.get(g.id) ?? 0 };
    })
    .sort((a, b) =>
      (b.score ?? -1) - (a.score ?? -1) || b.ratings - a.ratings || b.seconds - a.seconds,
    )
    .slice(0, take);
}

const userSelect = { id: true, displayName: true, robloxUsername: true, robloxVerified: true, robloxUserId: true } as const;

/** Testers ranked by the minutes they spent playing other devs' games (finished plays break ties). */
export async function topTesters(take = 20) {
  const [timeRows, doneRows] = await Promise.all([
    db.playTask.groupBy({ by: ["playerId"], where: { playedSeconds: { gt: 0 } }, _sum: { playedSeconds: true } }),
    db.playTask.groupBy({ by: ["playerId"], where: { status: "COMPLETED" }, _count: { id: true } }),
  ]);
  const done = new Map(doneRows.map((r) => [r.playerId, r._count.id]));
  const ranked = timeRows
    .map((r) => ({ id: r.playerId, seconds: r._sum.playedSeconds ?? 0, plays: done.get(r.playerId) ?? 0 }))
    .filter((r) => r.seconds >= 60)
    .sort((a, b) => b.seconds - a.seconds || b.plays - a.plays)
    .slice(0, take);
  const users = await db.user.findMany({ where: { id: { in: ranked.map((r) => r.id) } }, select: userSelect });
  const byId = new Map(users.map((u) => [u.id, u]));
  return ranked.map((r) => ({ user: byId.get(r.id)!, minutes: Math.floor(r.seconds / 60), plays: r.plays })).filter((r) => r.user);
}

/** Public name: the verified Roblox name if linked, otherwise the display name. */
export function publicName(u: { displayName: string; robloxUsername: string | null; robloxVerified: boolean }) {
  return u.robloxVerified && u.robloxUsername ? u.robloxUsername : u.displayName;
}
