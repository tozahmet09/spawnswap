import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { db } from "@/lib/db";
import { parseTrailer } from "@/lib/trailer";
import { earningGameIds, isVerifiedGame, playQueue } from "@/lib/credits";
import { getUser } from "@/lib/auth";
import { Rail } from "@/components/Rail";
import { TrailerCard, type TrailerGame } from "@/components/TrailerCard";
import { displayName, gameThumbnails } from "@/lib/thumbs";
import { releaseLabel } from "@/lib/release";
import { planBadge, planOf, planRank } from "@/lib/plans";
import { gameRatings } from "@/lib/ratings";
import { REQUIRED_SECONDS } from "@/lib/money";
import { CREDITS_ON, VIDEOS_PER_WEEK } from "@/lib/flow";
import { videoQueue } from "@/lib/videoQueue";

export const dynamic = "force-dynamic";

type Row = { id: string; name: string; description: string; universeId: string | null; genre: string; playing: number; iconUrl: string | null; trailerUrl: string | null; scriptLastSeen: Date | null; seriesTestedAt?: Date | null; owner?: { plan: string; planUntil: Date | null } };
// Owner's plan rides along so paid plans can get their badge and their place in the rows.
const withOwner = { owner: { select: { plan: true, planUntil: true } } } as const;
// Pick fields one by one: this goes to the browser, so the game's tracker secret must never be in it.
const toCard = (g: Row): TrailerGame => ({
  id: g.id,
  name: displayName(g.name),
  genre: g.genre,
  pitch: pitchOf(g.description),
  playing: g.playing,
  iconUrl: g.iconUrl,
  trailer: parseTrailer(g.trailerUrl),
  verified: isVerifiedGame(g),
  tested: !!g.seriesTestedAt,
  tier: planBadge(g.owner),
});

/** First sentence or two of the description, short enough for the hero. */
function pitchOf(d: string) {
  const one = d.replace(/\s+/g, " ").trim();
  if (/^\[.*\]$/.test(one)) return ""; // Roblox placeholder like "[DESCRIPTION UNAVAILABLE]"
  if (one.length <= 140) return one;
  const cut = one.slice(0, 140);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "));
  return end > 60 ? cut.slice(0, end + 1) : cut.replace(/\s+\S*$/, "") + "…";
}

export default async function Home({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const { deleted } = await searchParams;
  const now = new Date();
  const user = await getUser();
  // Games that give THIS player a credit (only while credits are on): logged in, the ones they haven't played yet; logged out, every game with free slots.
  const earning = !CREDITS_ON ? new Set<string>() : user ? new Set((await playQueue(user.id)).map((c) => c.gameId)) : await earningGameIds();
  const earn = (
    earning.size ? await db.game.findMany({ where: { id: { in: [...earning] }, hiddenAt: null }, orderBy: { createdAt: "desc" }, take: 24, include: withOwner }) : []
  )
    // Pro and Max games first (their perk), then games with the tracker script.
    .sort((a, b) => planRank(b.owner) - planRank(a.owner) || Number(isVerifiedGame(b)) - Number(isVerifiedGame(a)))
    .map(toCard)
    .map((g) => ({ ...g, earns: true }));
  // "Continue": games this player started and hasn't finished, plus finished plays still waiting for their rating (last 2 days).
  const openTasks = user && CREDITS_ON
    ? await db.playTask.findMany({
        where: {
          playerId: user.id,
          game: { hiddenAt: null },
          OR: [
            { status: { in: ["PENDING", "PLAYED"] } },
            { status: "COMPLETED", rating: null, feedback: null, completedAt: { gt: new Date(now.getTime() - 48 * 3600e3) } },
          ],
        },
        orderBy: { createdAt: "desc" },
        take: 12,
        include: { game: { include: withOwner } },
      })
    : [];
  const going = openTasks.map((t) => ({
    ...toCard(t.game),
    progress: { seconds: t.playedSeconds, required: REQUIRED_SECONDS, done: t.status !== "PENDING", placeId: t.game.placeId },
  }));

  // Games already played in the TikTok series: the proof that step 3 really happens.
  const tested = (
    await db.game.findMany({ where: { hiddenAt: null, seriesTestedAt: { not: null } }, orderBy: { seriesTestedAt: "desc" }, take: 24, include: withOwner })
  ).map(toCard);

  // Not out yet: soonest release first. They join "All games" on their day.
  const soon = (await db.game.findMany({ where: { releaseAt: { gt: now }, hiddenAt: null }, orderBy: { releaseAt: "asc" }, take: 24, include: withOwner })).map((g) => ({
    ...toCard(g),
    release: releaseLabel(g.releaseAt!, now),
  }));

  // Every released game. Spotlight games (still running from Pro/Max) first, then Max, then games with a trailer.
  const fresh = (
    await db.game.findMany({
      where: { hiddenAt: null, OR: [{ releaseAt: null }, { releaseAt: { lte: now } }] },
      orderBy: { createdAt: "desc" },
      take: 40,
      include: withOwner,
    })
  )
    .sort(
      (a, b) =>
        Number(!!b.featuredUntil && b.featuredUntil > now) - Number(!!a.featuredUntil && a.featuredUntil > now) ||
        Number(planOf(b.owner).topOfAll) - Number(planOf(a.owner).topOfAll) ||
        Number(!!b.trailerUrl) - Number(!!a.trailerUrl),
    )
    .map(toCard);

  // Wide Roblox screenshots for every card on the page (one cached call).
  const all = [...going, ...earn, ...tested, ...fresh, ...soon];
  const universe = new Map<string, string | null>();
  for (const r of await db.game.findMany({ where: { id: { in: all.map((g) => g.id) } }, select: { id: true, universeId: true } })) universe.set(r.id, r.universeId);
  const thumbs = await gameThumbnails([...universe.values()]);
  // Star rating and number of ratings replace the Roblox player count, which isn't accurate for small games.
  const ratings = await gameRatings([...universe.keys()]);
  for (const g of all) {
    g.thumb = thumbs.get(universe.get(g.id) ?? "") ?? null;
    g.rating = ratings.get(g.id) ?? null;
  }

  // Only the first card of each game gets a view-transition name (two elements with one name cancel the animation).
  const named = new Set<string>();
  const vt = (list: TrailerGame[]) => list.map((g) => (named.has(g.id) ? g : (named.add(g.id), { ...g, vt: true })));
  const goingRow = vt(going);
  const earnRow = vt(earn);
  const testedRow = vt(tested);
  const freshRow = vt(fresh);
  const soonRow = vt(soon);

  // The one button: where a dev goes next depends on how far they are.
  const hasGame = user ? (await db.game.count({ where: { ownerId: user.id } })) > 0 : false;
  const cta = !user ? { href: "/signup", label: "Add your game" } : hasGame ? { href: "/dashboard", label: "See your place in line" } : { href: "/dashboard/games/new", label: "Add your game" };
  const inLine = (await videoQueue()).length;

  return (
    <div className="-mb-8 space-y-14 sm:-mb-12 sm:space-y-16">

      <section aria-labelledby="hero-title" className="relative -mt-2 sm:-mt-4">
        <div aria-hidden className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-lime/10 blur-3xl" />
        <p className="relative font-mono text-xs font-medium uppercase tracking-[.1em] text-lime">Free for Roblox developers</p>
        <h1 id="hero-title" className="relative mt-3 max-w-3xl font-display text-[38px] font-extrabold leading-[1.02] tracking-[-0.03em] sm:text-[60px]">
          Add your Roblox game. <span className="text-lime drop-shadow-[0_0_24px_rgba(200,240,49,.35)]">We play it on TikTok.</span>
        </h1>
        <p className="relative mt-4 max-w-xl text-[17px] leading-relaxed text-mute">
          We test new Roblox games in our TikTok series and show them to real players. You just paste the link.
        </p>
        <div className="relative mt-7 flex flex-wrap items-center gap-x-5 gap-y-3">
          <Link href={cta.href} className="btn h-12 px-6 text-[15px]">{cta.label} <ArrowRight className="h-4 w-4" /></Link>
          <span className="text-sm text-faint">Free. Takes about a minute.</span>
        </div>
        <ol className="relative mt-12 grid gap-8 border-t border-line pt-8 sm:grid-cols-3">
          {([
            ["Sign up", "Free, with your email."],
            ["Add your game", "Paste the Roblox link. Add your TikTok so we can tag you."],
            ["We play it on TikTok", `About ${VIDEOS_PER_WEEK} games a week, in the order they were added.${inLine ? ` ${inLine} ${inLine === 1 ? "game is" : "games are"} in line now.` : ""}`],
          ] as const).map(([t, d], i) => (
            <li key={t}>
              <div className="font-mono text-[32px] leading-none tabular-nums text-lime-ink">0{i + 1}</div>
              <div className="mt-4 font-semibold">{t}</div>
              <p className="mt-1 text-sm text-mute">{d}</p>
            </li>
          ))}
        </ol>
      </section>

      <div className="relative z-10 space-y-12 sm:space-y-14">
      {deleted && <p role="status" className="notice">Your account was deleted.</p>}

      {goingRow.length > 0 && (
        <section aria-labelledby="continue-title">
          <Head id="continue-title" accent title="Continue" sub="Games you started. Finish 10 minutes to get the credit.">
            <a href="/play/tasks" className="link-accent">See all <ArrowRight className="h-3.5 w-3.5" /></a>
          </Head>
          <Rail label="Continue playing">
            {goingRow.map((g) => <TrailerCard key={g.id} game={g} />)}
          </Rail>
        </section>
      )}

      {CREDITS_ON && (
        <section aria-labelledby="earn-title">
          <Head id="earn-title" accent title="Play & earn credits" sub="Play 10 minutes, get 1 credit, worth 1 real player for your game.">
            <Link href="/play" className="link-accent">My progress <ArrowRight className="h-3.5 w-3.5" /></Link>
          </Head>
          {earn.length === 0 ? (
            <p className="text-sm text-mute">No games give you a credit right now. New ones arrive all the time.</p>
          ) : (
            <Rail label="Games that give credits">
              {earnRow.map((g) => <TrailerCard key={g.id} game={g} />)}
            </Rail>
          )}
        </section>
      )}

      {testedRow.length > 0 && (
        <section aria-labelledby="tested-title">
          <Head id="tested-title" accent title="Played on our TikTok" sub="Games we already tested in the series." />
          <Rail label="Played on our TikTok">
            {testedRow.map((g) => <TrailerCard key={g.id} game={g} />)}
          </Rail>
        </section>
      )}

      <section aria-labelledby="all-title">
        <Head id="all-title" title="All games" sub="Every game on Spawnswap. Play anything you like." />
        {fresh.length === 0 ? (
          <p className="text-sm text-mute">
            Nothing here yet. <Link href="/signup" className="text-lime underline underline-offset-4">Add the first game.</Link>
          </p>
        ) : (
          <Rail label="All games">
            {freshRow.map((g) => <TrailerCard key={g.id} game={g} />)}
          </Rail>
        )}
      </section>

      {soon.length > 0 && (
        <section aria-labelledby="soon-title">
          <Head id="soon-title" title="Coming soon" sub="Games with a release date. Watch the trailer now, play on launch day." />
          <Rail label="Coming soon">
            {soonRow.map((g) => <TrailerCard key={g.id} game={g} />)}
          </Rail>
        </section>
      )}

      </div>
    </div>
  );
}

/** Section title row: title, one quiet line under it, an optional text link on the right. No frame. */
function Head({ id, title, sub, eyebrow, accent, children }: { id: string; title: string; sub?: string; eyebrow?: string; accent?: boolean; children?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div>
        {eyebrow && <p className={`mb-1.5 font-mono text-xs ${accent ? "text-lime" : "text-faint"}`}>{eyebrow}</p>}
        <h2 id={id} className="h-section">{title}</h2>
        {sub && <p className="sub">{sub}</p>}
      </div>
      {children}
    </div>
  );
}
