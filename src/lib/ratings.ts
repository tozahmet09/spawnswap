import "server-only";
import { db } from "./db";

/** Average stars and number of ratings per game, from verified players only. */
export async function gameRatings(gameIds: string[]) {
  if (!gameIds.length) return new Map<string, { avg: number; count: number }>();
  const rows = await db.playTask.groupBy({
    by: ["gameId"],
    where: { gameId: { in: gameIds }, status: "COMPLETED", rating: { not: null } },
    _avg: { rating: true },
    _count: { rating: true },
  });
  return new Map(rows.map((r) => [r.gameId, { avg: r._avg.rating ?? 0, count: r._count.rating }]));
}
