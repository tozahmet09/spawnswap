import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Form } from "@/components/Form";
import { INSTRUCTIONS_MAX, MESSAGE_MAX, PLATFORMS, creatorUrl, formatFollowers, formatPrice } from "@/lib/creators";
import { askForVideo } from "../../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ask for a video" };

/** A dev asks one creator for a video: picks the game, writes instructions and a short message. */
export default async function Ask({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const c = await db.creatorProfile.findUnique({ where: { id } });
  if (!c || c.hidden || c.userId === user.id) notFound();
  const games = await db.game.findMany({ where: { ownerId: user.id }, orderBy: { createdAt: "desc" }, select: { id: true, name: true } });

  return (
    <div className="mx-auto max-w-xl space-y-8">
      <div>
        <p className="eyebrow">Ask for a video</p>
        <h1 className="mt-1 page-title">
          <a href={creatorUrl(c.platform, c.handle)} target="_blank" rel="noopener noreferrer nofollow" className="hover:text-lime">@{c.handle}</a>
        </h1>
        <p className="mt-1 text-sm text-mute">
          {PLATFORMS[c.platform as keyof typeof PLATFORMS]} · <span className="tabular-nums">{formatFollowers(c.followers)}</span> followers · {formatPrice(c.priceUsd)}
        </p>
        <p className="mt-3 text-cream/90">{c.about}</p>
      </div>

      {games.length === 0 ? (
        <p className="notice"><Link href="/dashboard/games/new" className="text-lime hover:underline">Add your game</Link> first, then come back to ask for a video.</p>
      ) : (
        <Form action={askForVideo} submit="Send request">
          <input type="hidden" name="creatorId" value={c.id} />
          <div>
            <label htmlFor="gameId" className="label">Which game should they show?</label>
            <select id="gameId" name="gameId" required className="input" defaultValue={games[0].id}>
              {games.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="instructions" className="label">Instructions for the video (optional)</label>
            <textarea id="instructions" name="instructions" rows={4} maxLength={INSTRUCTIONS_MAX} className="input"
              placeholder="Show the first 3 stages and the secret room. Say the game name at the start. Link in bio." />
          </div>
          <div>
            <label htmlFor="message" className="label">Message</label>
            <textarea id="message" name="message" required rows={2} maxLength={MESSAGE_MAX} className="input"
              placeholder="Hi! I'd love a short about my obby. Is your price for 1 short ok for next week?" />
          </div>
          <p className="text-xs text-mute">When they accept, we email you both each other&apos;s email address, so you can agree on price and date.</p>
        </Form>
      )}
    </div>
  );
}
