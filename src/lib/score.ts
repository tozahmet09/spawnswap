/**
 * Game score: the average star rating (1-5) shown as a number out of 100,
 * e.g. 4.3 stars = 86. Games need MIN_RATINGS ratings before they get a score,
 * so a single 5-star rating can't put a game at the top of the leaderboard.
 */
export const MIN_RATINGS = 3;

export function gameScore(avg: number | null | undefined, count: number): number | null {
  if (avg == null || count < MIN_RATINGS) return null;
  return Math.round(avg * 20);
}

/** high = 75+, mid = 50-74, low = under 50. */
export function scoreBand(score: number): "high" | "mid" | "low" {
  return score >= 75 ? "high" : score >= 50 ? "mid" : "low";
}
