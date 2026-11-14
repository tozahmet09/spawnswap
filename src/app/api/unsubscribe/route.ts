import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkUnsubToken, siteBase } from "@/lib/weeklyReport";

export const dynamic = "force-dynamic";

/** One-click unsubscribe that mail apps call (List-Unsubscribe-Post). A GET just opens the confirm page. */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const u = url.searchParams.get("u") ?? "";
  const t = url.searchParams.get("t") ?? "";
  if (!u || !checkUnsubToken(u, t)) return NextResponse.json({ error: "bad link" }, { status: 400 });
  await db.user.updateMany({ where: { id: u }, data: { weeklyReport: false } });
  return NextResponse.json({ ok: true });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  return NextResponse.redirect(`${siteBase()}/unsubscribe${url.search}`);
}
