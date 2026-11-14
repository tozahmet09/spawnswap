import Link from "next/link";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { checkUnsubToken } from "@/lib/weeklyReport";

export const dynamic = "force-dynamic";
// The signed link is in the address bar, so never send it to other sites as a referrer.
export const metadata = { title: "Email settings", referrer: "no-referrer", robots: { index: false } };

async function setWeekly(f: FormData) {
  "use server";
  const u = String(f.get("u") ?? "");
  const t = String(f.get("t") ?? "");
  if (!u || !checkUnsubToken(u, t)) return;
  await db.user.updateMany({ where: { id: u }, data: { weeklyReport: f.get("on") === "1" } });
  revalidatePath("/unsubscribe");
}

export default async function Unsubscribe({ searchParams }: { searchParams: Promise<{ u?: string; t?: string }> }) {
  const { u = "", t = "" } = await searchParams;
  const user = u && t && checkUnsubToken(u, t) ? await db.user.findUnique({ where: { id: u }, select: { weeklyReport: true } }) : null;
  if (!user)
    return (
      <div className="mx-auto max-w-sm space-y-4 py-6">
        <h1 className="page-title">This link doesn&apos;t work</h1>
        <p className="text-sm text-mute">Open the link from your email again.</p>
        <Link href="/" className="btn w-full">Go to Spawnswap</Link>
      </div>
    );
  const on = user.weeklyReport;
  return (
    <div className="mx-auto max-w-sm space-y-4 py-6">
      <h1 className="page-title">{on ? "Stop the Friday email?" : "Friday email is off"}</h1>
      <p className="text-sm text-mute">
        {on
          ? "Every Friday we email you how many people played your games from Spawnswap that week."
          : "You won't get the weekly “who played your game” email any more. Other emails you ask for, like password resets, still arrive."}
      </p>
      <form action={setWeekly}>
        <input type="hidden" name="u" value={u} />
        <input type="hidden" name="t" value={t} />
        <input type="hidden" name="on" value={on ? "0" : "1"} />
        <button type="submit" className="btn w-full">{on ? "Stop these emails" : "Turn it back on"}</button>
      </form>
    </div>
  );
}
