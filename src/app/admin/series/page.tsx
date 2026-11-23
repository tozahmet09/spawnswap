import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { displayName } from "@/lib/thumbs";
import { adminSetSeries } from "@/app/actions";
import { planOf } from "@/lib/plans";
import { queuePositions } from "@/lib/videoQueue";

export const dynamic = "force-dynamic";
export const metadata = { title: "Video series", robots: { index: false } };

/** Mark the games played in the "testing games on SpawnSwap" videos. They get a "Tested" badge on their page and cards. */
export default async function SeriesAdmin() {
  await requireAdmin();
  const games = await db.game.findMany({
    where: { hiddenAt: null },
    orderBy: [{ seriesTestedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    take: 200,
    select: { id: true, name: true, seriesTestedAt: true, seriesVideoUrl: true, wantsVideoAt: true, tiktokHandle: true, owner: { select: { displayName: true, plan: true, planUntil: true } } },
  });
  // The line devs see on their dashboard: Max members first, then oldest game first. Tested games go below it.
  const line = await queuePositions();
  const pos = (g: (typeof games)[number]) => line.get(g.id) ?? Infinity;
  games.sort((a, b) => pos(a) - pos(b));
  const tested = games.filter((g) => g.seriesTestedAt).length;
  const asked = line.size;

  return (
    <div className="space-y-10">
      <div>
        <p className="eyebrow">Admin</p>
        <h1 className="mt-1 page-title">Video series</h1>
        <p className="mt-2 text-sm text-mute">
          Tick the games you played in a video. They get a &ldquo;Tested in our series&rdquo; badge. Paste the episode link (TikTok or YouTube) to show a &ldquo;Watch episode&rdquo; link. {tested} of {games.length} marked. {asked} {asked === 1 ? "game is" : "games are"} in line, in the order devs see. Max members go first, then the oldest game.
        </p>
      </div>
      <ul className="divide-y divide-line border-y border-line">
        {games.map((g) => (
          <li key={g.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-4 text-sm">
            <div className="min-w-0 flex-1 basis-48">
              {line.has(g.id) && <span className="mr-2 font-mono text-lime tabular-nums">#{line.get(g.id)}</span>}
              <Link href={`/games/${g.id}`} className="font-semibold hover:underline">{displayName(g.name)}</Link>
              <span className="text-mute"> by {g.owner.displayName}</span>
              {g.seriesTestedAt && <span className="ml-2 text-lime">Tested</span>}
              {!g.seriesTestedAt && planOf(g.owner).seriesPriority && <span className="ml-2 text-lime">Max · priority</span>}
              {g.tiktokHandle && (
                <a href={`https://www.tiktok.com/@${g.tiktokHandle}`} target="_blank" rel="noopener" className="ml-2 text-cream underline-offset-4 hover:underline">@{g.tiktokHandle}</a>
              )}
            </div>
            <form action={adminSetSeries} className="flex flex-1 basis-80 flex-wrap items-center gap-2">
              <input type="hidden" name="gameId" value={g.id} />
              <input
                name="videoUrl"
                type="url"
                defaultValue={g.seriesVideoUrl ?? ""}
                placeholder="Episode link (optional)"
                aria-label={`Episode link for ${g.name}`}
                className="input min-w-0 flex-1 basis-48"
              />
              <button name="action" value="set" className="btn">{g.seriesTestedAt ? "Save" : "Mark tested"}</button>
              {g.seriesTestedAt && <button name="action" value="remove" className="btn-quiet">Remove</button>}
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
