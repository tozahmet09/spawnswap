import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Form } from "@/components/Form";
import { ABOUT_MAX, MIN_FOLLOWERS } from "@/lib/creators";
import { saveCreatorProfile } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your creator listing" };

export default async function SocialProfile({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const { new: isNew } = await searchParams;
  const user = await requireUser();
  const card = await db.creatorProfile.findUnique({ where: { userId: user.id } });

  const creatorForm = (
    <section className="space-y-4">
      <div>
        <h2 className="h-section">{card ? "Your listing" : "Post your listing"}</h2>
        <p className="sub">Devs see this on the Social media tab and can ask you for a video. You need at least {MIN_FOLLOWERS.toLocaleString("en-US")} followers.</p>
      </div>
      <Form action={saveCreatorProfile} submit={card ? "Save listing" : "Post my listing"}>
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
            <p className="mt-1 text-xs text-faint">At least {MIN_FOLLOWERS.toLocaleString("en-US")}. Use your real count, listings get checked.</p>
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
            <span>Hide my listing for now.</span>
          </label>
        )}
      </Form>
    </section>
  );

  return (
    <div className="mx-auto max-w-xl space-y-10">
      <div>
        <p className="eyebrow">Social media</p>
        <h1 className="mt-1 page-title">{isNew ? "Welcome, creator" : card ? "Your creator listing" : "Post a creator listing"}</h1>
        <p className="mt-2 text-mute">
          Make TikTok or YouTube videos about Roblox games? Post your listing and devs can pick you for a video.
          Make games too? You can add them from My Games with the same account.{" "}
          <Link href="/social" className="text-lime hover:underline">Open Social media</Link>
        </p>
      </div>

      {creatorForm}
    </div>
  );
}
