import { NextResponse } from "next/server";
import { buildAddGameReminder, sendAddGameReminders } from "@/lib/addGameReminder";
import { sendEmail } from "@/lib/email";
import { getUser } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Daily "your credits are ready, add your game" email (see vercel.json).
 * If CRON_SECRET is set, Vercel sends it as a Bearer token and every other caller is turned away.
 * Without it, an extra call is harmless: each account gets this email at most once.
 *
 * Admins (signed in) can look first: ?preview=1 shows the email, ?test=1 sends it to themselves.
 */
async function run(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.has("preview") || url.searchParams.has("test")) {
    const me = await getUser();
    if (!me || !isAdminEmail(me.email)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    const r = buildAddGameReminder(me);
    if (url.searchParams.has("test")) {
      const ok = await sendEmail(me.email, `[test] ${r.subject}`, r.text, r.html, r.headers);
      return NextResponse.json({ ok, to: me.email, subject: r.subject });
    }
    return new NextResponse(`<p style="font:13px sans-serif;color:#666">Subject: ${r.subject.replace(/[<>&]/g, "")}</p>${r.html}`, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const secret = process.env.CRON_SECRET?.trim();
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const r = await sendAddGameReminders();
  console.log("add-game reminder", r);
  return NextResponse.json({ ok: true, ...r });
}

export const GET = run;
export const POST = run;
