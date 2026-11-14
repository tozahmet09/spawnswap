import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { displayName } from "@/lib/thumbs";
import { adminSetSeries } from "@/app/actions";
import { planOf } from "@/lib/plans";

export const dynamic = "force-dynamic";
export const metadata = { title: "Video series", robots: { index: false } };

/** Mark the games played in the "testing games on SpawnSwap" videos. They get a "Tested" badge on their page and cards. */
export default async function SeriesAdmin() {
  await requireAdmin();
  const games = await db.game.findMany({
    where: { hiddenAt: null },
    orderBy: [{ seriesTestedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    take: 200,
    select: { id: true, name: true, seriesTestedAt: true, seriesVideoUrl: true, wantsVideoAt: true, owner: { select: { displayName: true, plan: true, planUntil: true } } },
  });
  // Untested games go to the top in this order: Max members (their plan perk), then devs who asked for a video, then the rest.
  const rank = (g: (typeof games)[number]) => (g.seriesTestedAt ? 3 : planOf(g.owner).seriesPriority ? 0 : g.wantsVideoAt ? 1 : 2);
  games.sort((a, b) => rank(a) - rank(b));
  const tested = games.filter((g) => g.seriesTestedAt).length;
  const asked = games.filter((g) => !g.seriesTestedAt && g.wantsVideoAt).length;

  return (
    <div className="space-y-10">
      <div>
        <p className="eyebrow">Admin</p>
        <h1 className="mt-1 page-title">Video series</h1>
        <p className="mt-2 text-sm text-mute">
          Tick the games you played in a video. They get a &ldquo;Tested in our series&rdquo; badge. Paste the episode link (TikTok or YouTube) to show a &ldquo;Watch episode&rdquo; link. {tested} of {games.length} marked. {asked} {asked === 1 ? "game is" : "games are"} waiting for a video.
        </p>
      </div>
      <ul className="divide-y divide-line border-y border-line">
        {games.map((g) => (
          <li key={g.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-4 text-sm">
            <div className="min-w-0 flex-1 basis-48">
              <Link href={`/games/${g.id}`} className="font-semibold hover:underline">{displayName(g.name)}</Link>
              <span className="text-mute"> by {g.owner.displayName}</span>
              {g.seriesTestedAt && <span className="ml-2 text-lime">Tested</span>}
              {!g.seriesTestedAt && planOf(g.owner).seriesPriority && <span className="ml-2 text-lime">Max · priority</span>}
              {!g.seriesTestedAt && g.wantsVideoAt && <span className="ml-2 text-lime">Wants a video</span>}
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
