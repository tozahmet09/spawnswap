import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Form } from "@/components/Form";
import { GameIcon } from "@/components/GameIcon";
import { INSTRUCTIONS_MAX, PLATFORMS, creatorUrl, formatFollowers, formatPrice } from "@/lib/creators";
import { answerRequest } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Video requests" };

const STATUS: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "Waiting", cls: "bg-white/[.06] text-mute" },
  ACCEPTED: { label: "Accepted", cls: "bg-lime/15 text-lime" },
  DECLINED: { label: "Declined", cls: "bg-danger/10 text-danger" },
};

export default async function Requests() {
  const user = await requireUser();
  const card = await db.creatorProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
  const mine = [{ devId: user.id }, ...(card ? [{ creatorId: card.id }] : [])];
  const [all, games] = await Promise.all([
    db.videoRequest.findMany({
      where: { OR: mine },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        creator: { include: { user: { select: { email: true } } } },
        dev: { select: { displayName: true, email: true } },
        game: { select: { id: true, name: true, iconUrl: true } },
      },
    }),
    db.game.findMany({ where: { ownerId: user.id }, orderBy: { createdAt: "desc" }, select: { id: true, name: true } }),
  ]);
  // Received = the other side sent it to me.
  const received = all.filter((r) => (r.fromRole === "CREATOR" ? r.devId === user.id : r.creatorId === card?.id));
  const sent = all.filter((r) => !received.includes(r));
  const byStatus = (a: typeof all) => [...a].sort((x, y) => Number(y.status === "PENDING") - Number(x.status === "PENDING"));

  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <div>
        <p className="eyebrow">Social media</p>
        <h1 className="mt-1 page-title">Video requests</h1>
        <p className="mt-2 text-mute">
          Requests between you and {user.role === "CREATOR" ? "developers" : "creators"}. Once one is accepted, we email you both.{" "}
          <Link href="/social" className="text-lime hover:underline">Find more on Social media</Link>
        </p>
      </div>

      <section className="space-y-2">
        <h2 className="h-section">Sent to you</h2>
        {received.length === 0 ? (
          <p className="py-6 text-sm text-mute">Nothing yet. When someone sends you a request, it shows here and you get an email.</p>
        ) : (
          <ul className="divide-y divide-line">
            {byStatus(received).map((r) => (
              <li key={r.id} className="space-y-3 py-5">
                <Head r={r} from={r.fromRole === "CREATOR" ? "creator" : "dev"} />
                <p className="text-cream/90">&ldquo;{r.message}&rdquo;</p>
                <Deal r={r} />
                {r.status === "PENDING" && (
                  <div className="flex flex-wrap items-start gap-3">
                    {r.fromRole === "CREATOR" ? (
                      games.length === 0 ? (
                        <p className="notice"><Link href="/dashboard/games/new" className="text-lime hover:underline">Add your game</Link> to accept.</p>
                      ) : (
                        <Form action={answerRequest} submit="Accept" className="w-full max-w-lg space-y-3" buttonClass="btn">
                          <input type="hidden" name="id" value={r.id} />
                          <input type="hidden" name="answer" value="accept" />
                          <div>
                            <label htmlFor={`game-${r.id}`} className="label">Which game should they show?</label>
                            <select id={`game-${r.id}`} name="gameId" required className="input" defaultValue={games[0].id}>
                              {games.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                            </select>
                          </div>
                          <div>
                            <label htmlFor={`ins-${r.id}`} className="label">Instructions for the video (optional)</label>
                            <textarea id={`ins-${r.id}`} name="instructions" rows={3} maxLength={INSTRUCTIONS_MAX} className="input"
                              placeholder="Show the boss fight. Say the game name at the start. Link in bio." />
                          </div>
                        </Form>
                      )
                    ) : (
                      <Form action={answerRequest} submit="Accept" className="" buttonClass="btn">
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="answer" value="accept" />
                      </Form>
                    )}
                    <Form action={answerRequest} submit="Decline" className="" buttonClass="btn-quiet">
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="answer" value="decline" />
                    </Form>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rule space-y-2 pt-8">
        <h2 className="h-section">You sent</h2>
        {sent.length === 0 ? (
          <p className="py-6 text-sm text-mute">
            You haven&apos;t sent any yet. <Link href="/social" className="text-lime hover:underline">Open Social media</Link>
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {byStatus(sent).map((r) => (
              <li key={r.id} className="space-y-3 py-5">
                <Head r={r} from={r.fromRole === "CREATOR" ? "dev" : "creator"} sent />
                <p className="text-cream/90">&ldquo;{r.message}&rdquo;</p>
                <Deal r={r} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

type Req = {
  status: string; createdAt: Date; instructions: string | null;
  creator: { platform: string; handle: string; followers: number; priceUsd: number | null; user: { email: string } };
  dev: { displayName: string; email: string };
  game: { id: string; name: string; iconUrl: string | null } | null;
};

/** Who the other side is, and the status. `from` = whose name to show. */
function Head({ r, from, sent }: { r: Req; from: "creator" | "dev"; sent?: boolean }) {
  const s = STATUS[r.status] ?? STATUS.PENDING;
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      {from === "creator" ? (
        <>
          <a href={creatorUrl(r.creator.platform, r.creator.handle)} target="_blank" rel="noopener noreferrer nofollow" className="font-semibold hover:text-lime">@{r.creator.handle}</a>
          <span className="text-xs text-mute">
            {PLATFORMS[r.creator.platform as keyof typeof PLATFORMS]} · <span className="tabular-nums">{formatFollowers(r.creator.followers)}</span> followers · {formatPrice(r.creator.priceUsd)}
          </span>
        </>
      ) : (
        <span className="font-semibold">{r.dev.displayName}</span>
      )}
      <span className={`chip ${s.cls}`}>{s.label}</span>
      <span className="text-xs text-faint">{sent ? "Sent " : ""}{r.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
    </div>
  );
}

/** The game and instructions, and both emails once accepted. */
function Deal({ r }: { r: Req }) {
  return (
    <>
      {r.game && (
        <Link href={`/games/${r.game.id}`} className="group flex items-center gap-3">
          <GameIcon url={r.game.iconUrl} className="h-10 w-10 shrink-0 rounded-ctl" />
          <span className="font-semibold group-hover:text-lime">{r.game.name}</span>
        </Link>
      )}
      {r.instructions && (
        <div className="border-l-2 border-line pl-3 text-sm">
          <div className="text-xs uppercase tracking-[.08em] text-faint">Instructions</div>
          <p className="mt-1 whitespace-pre-line text-cream/90">{r.instructions}</p>
        </div>
      )}
      {r.status === "ACCEPTED" && (
        <p className="notice">
          Dev: <span className="text-cream">{r.dev.email}</span> · Creator: <span className="text-cream">{r.creator.user.email}</span>
          <br />Agree on price and date between you. Paid videos must say #ad.
        </p>
      )}
    </>
  );
}
