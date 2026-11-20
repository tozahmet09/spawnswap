import Link from "next/link";
import { ArrowRight, Inbox } from "lucide-react";
import { db } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { PLATFORMS, creatorUrl, formatFollowers, formatPrice } from "@/lib/creators";
import { GameIcon } from "@/components/GameIcon";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Social media",
  description: "Roblox devs meet TikTok and YouTube creators who make videos about games. Ask for a video, or offer one.",
};

const TABS = [
  { id: "creators", label: "Creators", sub: "TikTok and YouTube creators who make videos about Roblox games. Devs: ask one for a video about your game." },
  { id: "devs", label: "Devs looking for videos", sub: "Developers who want a video about their game. Creators: offer to make one." },
] as const;
type Tab = (typeof TABS)[number]["id"];

export default async function Social({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await getUser();
  const isCreator = user?.role === "CREATOR";
  const { tab: raw } = await searchParams;
  // Creators come here to find devs, devs to find creators.
  const tab: Tab = TABS.some((t) => t.id === raw) ? (raw as Tab) : isCreator ? "devs" : "creators";
  const info = TABS.find((t) => t.id === tab)!;

  const [myCard, waiting] = user
    ? await Promise.all([
        db.creatorProfile.findUnique({ where: { userId: user.id }, select: { id: true } }),
        db.videoRequest.count({
          where: { status: "PENDING", OR: [{ devId: user.id, fromRole: "CREATOR" }, { creator: { userId: user.id }, fromRole: "DEV" }] },
        }),
      ])
    : [null, 0];

  const creators =
    tab === "creators"
      ? await db.creatorProfile.findMany({
          where: { hidden: false },
          orderBy: [{ followers: "desc" }],
          take: 100,
          include: { user: { select: { displayName: true } } },
        })
      : [];
  const devs =
    tab === "devs"
      ? await db.user.findMany({
          where: { devPost: { not: null }, games: { some: { hiddenAt: null } } },
          orderBy: { devPostAt: "desc" },
          take: 100,
          select: {
            id: true, displayName: true, devPost: true,
            games: { where: { hiddenAt: null }, orderBy: { createdAt: "desc" }, take: 4, select: { id: true, name: true, iconUrl: true } },
          },
        })
      : [];

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="eyebrow">Social media</p>
          <h1 className="mt-1 page-title">Get your game in a video</h1>
          <p className="mt-2 max-w-2xl text-mute">{info.sub}</p>
        </div>
        {user && (
          <div className="flex flex-wrap gap-2">
            <Link href="/social/requests" className="btn-quiet">
              <Inbox className="h-4 w-4" aria-hidden /> Requests
              {waiting > 0 && <span className="chip bg-lime text-navy tabular-nums">{waiting}</span>}
            </Link>
            <Link href="/social/profile" className="btn-quiet">{isCreator ? (myCard ? "My creator card" : "Make your card") : "My post"}</Link>
          </div>
        )}
      </div>

      <div className="flex gap-2 overflow-x-auto border-b border-line text-[15px]" role="tablist">
        {TABS.map((t) => (
          <Link key={t.id} href={`/social?tab=${t.id}`} role="tab" aria-selected={tab === t.id}
            className={`relative -mb-px whitespace-nowrap px-3 py-3 font-semibold transition ${tab === t.id ? "text-lime" : "text-cream/80 hover:text-cream"}`}>
            {t.label}
            {tab === t.id && <span aria-hidden className="absolute inset-x-0 bottom-0 h-[3px] rounded-full bg-lime shadow-[0_0_12px_rgba(200,240,49,.8)]" />}
          </Link>
        ))}
      </div>

      {tab === "creators" &&
        (creators.length === 0 ? (
          <Empty text="No creators yet." cta={{ href: user ? "/social/profile" : "/signup?as=creator", label: "Make videos? Add your card" }} />
        ) : (
          <ul className="divide-y divide-line">
            {creators.map((c, i) => (
              <li key={c.id} className="flex animate-rise-in flex-wrap items-center gap-x-4 gap-y-3 py-4" style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}>
                <span aria-hidden className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-line font-display text-lg font-bold text-cream">
                  {c.handle.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1 basis-56">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <a href={creatorUrl(c.platform, c.handle)} target="_blank" rel="noopener noreferrer nofollow" className="truncate font-semibold hover:text-lime">@{c.handle}</a>
                    <span className="text-xs text-mute">{PLATFORMS[c.platform as keyof typeof PLATFORMS]} · <span className="tabular-nums">{formatFollowers(c.followers)}</span> followers</span>
                  </div>
                  <p className="mt-0.5 text-sm text-mute">{c.about}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-sm font-semibold tabular-nums text-cream">{formatPrice(c.priceUsd)}</span>
                  {myCard?.id !== c.id && (
                    <Link href={user ? `/social/ask/${c.id}` : "/signup"} className="btn">Ask for a video</Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ))}

      {tab === "devs" &&
        (devs.length === 0 ? (
          <Empty text="No developer posts yet." cta={{ href: user ? "/social/profile" : "/signup", label: "Have a game? Post what video you want" }} />
        ) : (
          <ul className="divide-y divide-line">
            {devs.map((d, i) => (
              <li key={d.id} className="flex animate-rise-in flex-wrap items-center gap-x-4 gap-y-3 py-4" style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}>
                <div className="flex shrink-0 -space-x-3">
                  {d.games.slice(0, 3).map((g) => (
                    <GameIcon key={g.id} url={g.iconUrl} className="h-12 w-12 rounded-ctl ring-2 ring-navy" />
                  ))}
                </div>
                <div className="min-w-0 flex-1 basis-56">
                  <div className="font-semibold">{d.displayName}</div>
                  <p className="mt-0.5 text-sm text-cream/90">{d.devPost}</p>
                  <p className="mt-1 text-xs text-mute">
                    {d.games.map((g, j) => (
                      <span key={g.id}>{j > 0 && " · "}<Link href={`/games/${g.id}`} className="hover:text-cream">{g.name}</Link></span>
                    ))}
                  </p>
                </div>
                {user?.id !== d.id && (
                  <Link href={user ? `/social/offer/${d.id}` : "/signup?as=creator"} className="btn shrink-0">Offer a video</Link>
                )}
              </li>
            ))}
          </ul>
        ))}

      <p className="notice">
        Spawnswap introduces you; price and payment are agreed between dev and creator. Only creators 18 or older are listed.
        Paid videos must say #ad or use the paid partnership label.
      </p>
    </div>
  );
}

function Empty({ text, cta }: { text: string; cta: { href: string; label: string } }) {
  return (
    <p className="py-16 text-center text-mute">
      {text}{" "}
      <Link href={cta.href} className="inline-flex items-center gap-1 font-semibold text-lime hover:underline">
        {cta.label} <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </p>
  );
}
