import { NextResponse } from "next/server";
import { sendWeeklyReports, buildReport } from "@/lib/weeklyReport";
import { sendEmail } from "@/lib/email";
import { getUser } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { rateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Friday "who played your game this week" emails. Vercel Cron calls this every Friday (see vercel.json).
 * If CRON_SECRET is set, Vercel sends it as a Bearer token and every other caller is turned away.
 * Without it, calling early is harmless: it only works on Fridays (UTC) and each person gets
 * at most one report every 6 days.
 *
 * Admins (signed in) can look first: ?preview=1 shows their own report, ?preview=1&user=<id> someone's,
 * ?test=1 emails their own report to themselves.
 */
async function run(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.has("preview") || url.searchParams.has("test")) {
    const me = await getUser();
    if (!me || !isAdminEmail(me.email)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    const r = await buildReport(url.searchParams.get("user") || me.id);
    if (!r) return NextResponse.json({ error: "no live game for this user" }, { status: 404 });
    if (url.searchParams.has("test")) {
      const ok = await sendEmail(me.email, `[test] ${r.subject}`, r.text, r.html, r.headers);
      return NextResponse.json({ ok, to: me.email, subject: r.subject });
    }
    return new NextResponse(`<p style="font:13px sans-serif;color:#666">To: ${r.to.replace(/[<>&]/g, "")}<br>Subject: ${r.subject.replace(/[<>&]/g, "")}</p>${r.html}`, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const secret = process.env.CRON_SECRET?.trim();
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (new Date().getUTCDay() !== 5) return NextResponse.json({ ok: true, skipped: "not friday" });
  if (!(await rateLimit("weekly-report:cron", 3, 3600e3))) return NextResponse.json({ ok: true, skipped: "already ran" });
  const r = await sendWeeklyReports();
  console.log("weekly report", r);
  return NextResponse.json({ ok: true, ...r });
}

export const GET = run;
export const POST = run;
