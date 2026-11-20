import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Form } from "@/components/Form";
import { GameIcon } from "@/components/GameIcon";
import { MESSAGE_MAX } from "@/lib/creators";
import { offerVideo } from "../../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Offer a video" };

/** A creator offers a dev to make a video. The dev then picks the game and writes the instructions. */
export default async function Offer({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  if (id === user.id) notFound();
  const dev = await db.user.findUnique({
    where: { id },
    select: {
      displayName: true, devPost: true,
      games: { where: { hiddenAt: null }, orderBy: { createdAt: "desc" }, take: 6, select: { id: true, name: true, iconUrl: true, genre: true } },
    },
  });
  if (!dev || dev.games.length === 0) notFound();
  const card = await db.creatorProfile.findUnique({ where: { userId: user.id }, select: { hidden: true } });

  return (
    <div className="mx-auto max-w-xl space-y-8">
      <div>
        <p className="eyebrow">Offer a video</p>
        <h1 className="mt-1 page-title">{dev.displayName}</h1>
        {dev.devPost && <p className="mt-3 text-cream/90">&ldquo;{dev.devPost}&rdquo;</p>}
      </div>

      <ul className="divide-y divide-line">
        {dev.games.map((g) => (
          <li key={g.id}>
            <Link href={`/games/${g.id}`} className="group flex items-center gap-3 py-2.5">
              <GameIcon url={g.iconUrl} className="h-10 w-10 shrink-0 rounded-ctl" />
              <span className="min-w-0 flex-1 truncate font-semibold group-hover:text-lime">{g.name}</span>
              <span className="text-xs text-mute">{g.genre}</span>
            </Link>
          </li>
        ))}
      </ul>

      {!card ? (
        <p className="notice"><Link href="/social/profile" className="text-lime hover:underline">Make your creator card</Link> first, so the developer can see who you are.</p>
      ) : card.hidden ? (
        <p className="notice">Your creator card is hidden. <Link href="/social/profile" className="text-lime hover:underline">Show it</Link> first, so the developer can see who you are.</p>
      ) : (
        <Form action={offerVideo} submit="Send offer">
          <input type="hidden" name="devId" value={id} />
          <div>
            <label htmlFor="message" className="label">Message</label>
            <textarea id="message" name="message" required rows={3} maxLength={MESSAGE_MAX} className="input"
              placeholder="Hey! I make 30s shorts about obbies, around 5K views each. I'd love to show your game." />
          </div>
          <p className="text-xs text-mute">If they accept, they pick which game you show and can add instructions. Then we email you both.</p>
        </Form>
      )}
    </div>
  );
}
