import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { payPlayed } from "@/lib/credits";

export const dynamic = "force-dynamic";

// Read-only snapshot polled every few seconds by "My progress", so the timer moves without a page refresh.
// It never talks to Roblox (the presence cron and /api/presence do that), so it's cheap to call often.
export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "login required" }, { status: 401 });
  await payPlayed({ playerId: user.id });
  const tasks = await db.playTask.findMany({
    where: { playerId: user.id, status: { in: ["PENDING", "PLAYED", "COMPLETED"] } },
    select: { id: true, status: true, playedSeconds: true, lastPingAt: true, presenceCheckedAt: true, completedAt: true },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  return NextResponse.json({ now: Date.now(), tasks: tasks.map(snap) });
}

function snap(t: { id: string; status: string; playedSeconds: number; lastPingAt: Date | null; presenceCheckedAt: Date | null; completedAt: Date | null }) {
  return {
    id: t.id,
    status: t.status,
    playedSeconds: t.playedSeconds,
    lastPingAt: t.lastPingAt?.getTime() ?? null,
    presenceCheckedAt: t.presenceCheckedAt?.getTime() ?? null,
    completedAt: t.completedAt?.getTime() ?? null,
  };
}
