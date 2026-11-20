import Link from "next/link";
import { ArrowRight, Inbox } from "lucide-react";
import { db } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { MIN_FOLLOWERS, PLATFORMS, creatorUrl, formatFollowers, formatPrice } from "@/lib/creators";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Social media",
  description: "TikTok and YouTube creators who make videos about Roblox games. Pick one and ask for a video about your game.",
};

export default async function Social() {
  const user = await getUser();
  const [myCard, waiting] = user
    ? await Promise.all([
        db.creatorProfile.findUnique({ where: { userId: user.id }, select: { id: true } }),
        db.videoRequest.count({
          where: { status: "PENDING", OR: [{ devId: user.id, fromRole: "CREATOR" }, { creator: { userId: user.id }, fromRole: "DEV" }] },
        }),
      ])
    : [null, 0];

  // Only creators post listings here; devs (and anyone) browse and ask one for a video.
  const creators = await db.creatorProfile.findMany({
    where: { hidden: false, followers: { gte: MIN_FOLLOWERS } },
    orderBy: [{ followers: "desc" }],
    take: 100,
  });
  const cardHref = user ? "/social/profile" : "/signup?as=creator";

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="eyebrow">Social media</p>
          <h1 className="mt-1 page-title">Get your game in a video</h1>
          <p className="mt-2 max-w-2xl text-mute">TikTok and YouTube creators who make videos about Roblox games. Pick one and ask for a video about your game.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {user && (
            <Link href="/social/requests" className="btn-quiet">
              <Inbox className="h-4 w-4" aria-hidden /> Requests
              {waiting > 0 && <span className="chip bg-lime text-navy tabular-nums">{waiting}</span>}
            </Link>
          )}
          <Link href={cardHref} className="btn-quiet">{myCard ? "My creator listing" : "Post a creator listing"}</Link>
        </div>
      </div>

      {creators.length === 0 ? (
        <Empty text="No creators yet." cta={{ href: cardHref, label: "Make videos? Post your listing" }} />
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
      )}

      <p className="notice">
        Spawnswap introduces you; price and payment are agreed between dev and creator. Only creators 18 or older with {MIN_FOLLOWERS.toLocaleString("en-US")}+ followers are listed.
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
