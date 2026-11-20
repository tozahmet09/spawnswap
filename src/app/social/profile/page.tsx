import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Form } from "@/components/Form";
import { ABOUT_MAX, POST_MAX } from "@/lib/creators";
import { saveCreatorProfile, saveDevPost, setRole } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your Social media profile" };

export default async function SocialProfile({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const { new: isNew } = await searchParams;
  const user = await requireUser();
  const isCreator = user.role === "CREATOR";
  const [card, games] = await Promise.all([
    db.creatorProfile.findUnique({ where: { userId: user.id } }),
    db.game.count({ where: { ownerId: user.id, hiddenAt: null } }),
  ]);

  const creatorForm = (
    <section className="space-y-4">
      <div>
        <h2 className="h-section">{card ? "Your creator card" : "Make your creator card"}</h2>
        <p className="sub">Devs see this on the Social media tab and can ask you for a video. You can also offer videos to devs.</p>
      </div>
      <Form action={saveCreatorProfile} submit={card ? "Save card" : "Show my card to devs"}>
        <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
          <div>
            <label htmlFor="platform" className="label">Where you post</label>
            <select id="platform" name="platform" defaultValue={card?.platform ?? "TIKTOK"} className="input">
              <option value="TIKTOK">TikTok</option>
              <option value="YOUTUBE">YouTube</option>
            </select>
          </div>
          <div>
            <label htmlFor="handle" className="label">Username or channel link</label>
            <input id="handle" name="handle" required defaultValue={card ? `@${card.handle}` : ""} placeholder="@yourname" className="input" />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="followers" className="label">Followers</label>
            <input id="followers" name="followers" inputMode="numeric" required defaultValue={card?.followers ?? ""} placeholder="2500" className="input" />
          </div>
          <div>
            <label htmlFor="price" className="label">Price for 1 video, in $ (empty = ask me)</label>
            <input id="price" name="price" inputMode="numeric" defaultValue={card?.priceUsd ?? ""} placeholder="20" className="input" />
          </div>
        </div>
        <div>
          <label htmlFor="about" className="label">What games do you promote?</label>
          <textarea id="about" name="about" required maxLength={ABOUT_MAX} rows={3} defaultValue={card?.about ?? ""}
            placeholder="I promote obby and horror games. 30 second shorts, posted within 3 days." className="input" />
        </div>
        <label className="flex items-start gap-3 text-sm text-mute">
          <input name="adult" type="checkbox" required defaultChecked={!!card} className="mt-0.5 h-5 w-5 shrink-0 accent-[#c8f031]" />
          <span>I&apos;m 18 or older. Devs pay creators, so only adults can be listed.</span>
        </label>
        {card && (
          <label className="flex items-start gap-3 text-sm text-mute">
            <input name="hidden" type="checkbox" defaultChecked={card.hidden} className="mt-0.5 h-5 w-5 shrink-0 accent-[#c8f031]" />
            <span>Hide my card from the list for now.</span>
          </label>
        )}
      </Form>
    </section>
  );

  const devForm = (
    <section className="space-y-4">
      <div>
        <h2 className="h-section">Your post for creators</h2>
        <p className="sub">Tell creators what video you want. It shows under &quot;Devs looking for videos&quot;. Leave it empty to take it down.</p>
      </div>
      {games === 0 ? (
        <p className="notice">
          <Link href="/dashboard/games/new" className="text-lime hover:underline">Add your game</Link> first, so creators know what they would show.
        </p>
      ) : (
        <Form action={saveDevPost} submit={user.devPost ? "Save post" : "Post it"}>
          <div>
            <label htmlFor="post" className="label">What you&apos;re looking for</label>
            <textarea id="post" name="post" maxLength={POST_MAX} rows={3} defaultValue={user.devPost ?? ""}
              placeholder="Looking for TikTokers to show my obby. Short gameplay clip, up to $15." className="input" />
          </div>
        </Form>
      )}
    </section>
  );

  return (
    <div className="mx-auto max-w-xl space-y-10">
      <div>
        <p className="eyebrow">Social media</p>
        <h1 className="mt-1 page-title">{isNew ? "Welcome, creator" : isCreator ? "Your creator card" : "Your post"}</h1>
        <p className="mt-2 text-mute">
          {isCreator
            ? "Make your card so devs can find you. Then look at devs looking for videos and offer to make one."
            : "Post what kind of video you want, or find a creator yourself on the Social media tab."}{" "}
          <Link href="/social" className="text-lime hover:underline">Open Social media</Link>
        </p>
      </div>

      {isCreator ? creatorForm : devForm}
      {!isCreator && card && <div className="rule pt-8">{creatorForm}</div>}

      <section className="rule space-y-3 pt-8">
        <h2 className="h-section">Account type</h2>
        <p className="sub">
          {isCreator
            ? "You're a creator. Make Roblox games too? Switch to a developer account to add games and get players."
            : "You're a developer. Make TikTok or YouTube videos? Switch to a creator account."}
          {" "}You can switch back any time.
        </p>
        <form action={setRole}>
          <input type="hidden" name="role" value={isCreator ? "DEV" : "CREATOR"} />
          <button className="btn-quiet">{isCreator ? "Switch to developer" : "Switch to creator"}</button>
        </form>
      </section>
    </div>
  );
}
