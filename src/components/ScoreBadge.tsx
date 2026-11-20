import { gameScore, MIN_RATINGS, scoreBand } from "@/lib/score";

const BAND = {
  high: "bg-lime text-navy shadow-[0_0_14px_rgba(200,240,49,.35)]",
  mid: "bg-[#f5c542] text-navy",
  low: "bg-[#ff5f73] text-white",
} as const;

const SIZE = {
  xs: "h-5 min-w-[26px] px-1 rounded-[5px]",
  sm: "h-9 w-9 rounded-[8px]",
  lg: "h-16 w-16 rounded-ctl",
} as const;
// Number size, and a smaller size for "TBD" so it fits the same square.
const TEXT = { xs: ["text-[11px]", "text-[9px]"], sm: ["text-[15px]", "text-[11px]"], lg: ["text-[30px]", "text-[18px]"] } as const;

/**
 * The game's score (0-100) in a colored square: lime = high, yellow = mid, red = low.
 * Below the minimum number of ratings it shows "TBD" on a plain outline.
 */
export function ScoreBadge({ avg, count, size = "sm" }: { avg: number | null | undefined; count: number; size?: keyof typeof SIZE }) {
  const score = gameScore(avg, count);
  const label =
    score == null
      ? `No score yet: ${count} of ${MIN_RATINGS} ratings needed`
      : `Score ${score} out of 100 from ${count} rating${count === 1 ? "" : "s"}`;
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={`inline-flex shrink-0 items-center justify-center font-display font-black leading-none tabular-nums ${SIZE[size]} ${TEXT[size][score == null ? 1 : 0]} ${
        score == null ? "border border-line text-faint" : BAND[scoreBand(score)]
      }`}
    >
      {score ?? "TBD"}
    </span>
  );
}
