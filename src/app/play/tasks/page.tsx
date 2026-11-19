import Link from "next/link";
import { CheckCircle2, ExternalLink, Ticket } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { expireStaleTasks, isVerifiedGame, payPlayed } from "@/lib/credits";
import { REQUIRED_SECONDS } from "@/lib/money";
import { robloxGameUrl } from "@/lib/roblox";
import { GameIcon } from "@/components/GameIcon";
import { LivePlay, LiveProgress } from "@/components/LivePlay";
import { RateForm } from "@/components/RateForm";
import { AbandonButton } from "@/components/AbandonButton";

export const dynamic = "force-dynamic";

export default async function Tasks({ searchParams }: { searchParams: Promise<{ started?: string; error?: string }> }) {
  const user = await requireUser();
  const { started, error } = await searchParams;
  await expireStaleTasks();
  await payPlayed({ playerId: user.id });
  const tasks = await db.playTask.findMany({
    where: { playerId: user.id, status: { not: "EXPIRED" } },
    include: { game: true },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  const mins = Math.round(REQUIRED_SECONDS / 60);
  const now = Date.now();
  // Only show the "open in Roblox" banner while that game still needs playtime.
  const startedOpen = started && tasks.some((t) => t.game.placeId === started && t.status === "PENDING");
  // Games without the tracker script are timed by checking the player's Roblox status from this page.
  const watching = tasks.some((t) => t.status === "PENDING" && !isVerifiedGame(t.game));

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">My progress</p>
          <h1 className="mt-1 page-title">Games you&apos;re playing</h1>
        </div>
        <Link href="/#earn-title" className="btn-quiet">Find games</Link>
      </div>

      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {watching && (
        <p className="notice">
          You can close this page and just play. We check your Roblox status every minute, so minutes only count while you&apos;re in the game. The timer here updates by itself, and your credit comes in once you hit {mins} minutes.
        </p>
      )}

      {startedOpen && (
        <div className="flex flex-wrap items-center gap-4 border-l-2 border-lime py-1 pl-4">
          <p className="min-w-0 flex-1 text-sm">
            Saved for you. Play {mins} min as <b>{user.robloxUsername}</b>, then come back to review.
          </p>
          <a href={robloxGameUrl(started!)} target="_blank" rel="noopener" className="btn">Open in Roblox <ExternalLink className="h-4 w-4" /></a>
        </div>
      )}

      {tasks.length === 0 && <p className="text-mute">Nothing yet. <Link href="/#earn-title" className="text-lime underline">Pick a game that gives credits</Link>.</p>}

      <LivePlay
        initial={tasks.map((t) => ({
          id: t.id,
          status: t.status,
          playedSeconds: t.playedSeconds,
          lastPingAt: t.lastPingAt?.getTime() ?? null,
          presenceCheckedAt: t.presenceCheckedAt?.getTime() ?? null,
          completedAt: t.completedAt?.getTime() ?? null,
        }))}
        unrated={tasks
          .filter((t) => t.status === "COMPLETED" && t.rating === null && t.feedback === null && t.completedAt)
          .map((t) => ({ id: t.id, completedAt: t.completedAt!.getTime() }))}
        required={REQUIRED_SECONDS}
        watchPresence={watching}
        serverNow={now}
      >
      <ul className="divide-y divide-line border-y border-line">
        {tasks.map((t) => {
          return (
            <li key={t.id} className="space-y-4 py-5">
              <div className="flex items-center gap-4">
                <GameIcon url={t.game.iconUrl} className="h-12 w-12 shrink-0 rounded-ctl" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{t.game.name}</div>
                  {t.status === "PENDING" && <LiveProgress id={t.id} required={REQUIRED_SECONDS} fallback={t.playedSeconds} />}
                  {t.status === "COMPLETED" && (
                    <div className="inline-flex items-center gap-1.5 text-sm text-verified"><CheckCircle2 className="h-4 w-4" /> Played {mins} min · credit earned</div>
                  )}
                </div>
                {t.status === "PENDING" && (
                  <a href={robloxGameUrl(t.game.placeId)} target="_blank" rel="noopener" className="btn-quiet">Play</a>
                )}
                {t.status === "PENDING" && (
                  <AbandonButton taskId={t.id} name={t.game.name} />
                )}
                {t.status === "COMPLETED" && (
                  <span className="inline-flex items-center gap-1 text-sm text-mute"><Ticket className="h-4 w-4 text-lime" /> +1</span>
                )}
              </div>
              {t.status === "COMPLETED" && t.rating === null && t.feedback === null && <RateForm taskId={t.id} game={t.game.name} />}
            </li>
          );
        })}
      </ul>
      </LivePlay>
    </div>
  );
}
