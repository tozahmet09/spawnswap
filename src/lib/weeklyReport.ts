import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import { db } from "./db";
import { emailEnabled, sendEmail } from "./email";

/**
 * Friday email to every developer with a live game: how many people played it from Spawnswap
 * in the last 7 days (verified 10-minute plays), the minutes, the stars, and who played.
 * Weeks with no plays still get a short note with their credits and how to get players.
 */

const WEEK_MS = 7 * 864e5;
// Never two reports to the same person within 6 days, even if the scheduler fires twice.
const MIN_GAP_MS = 6 * 864e5;

export function siteBase() {
  return (process.env.APP_URL?.trim() || "https://spawnswap.com").replace(/\/+$/, "");
}

/** Signs unsubscribe links so nobody can switch off someone else's emails by guessing ids. */
function unsubKey() {
  return process.env.UNSUBSCRIBE_SECRET?.trim() || process.env.CRON_SECRET?.trim() || process.env.RESEND_API_KEY?.trim() || "dev-only-unsubscribe-key";
}
export function unsubToken(userId: string) {
  return createHmac("sha256", unsubKey()).update(`weekly-report:${userId}`).digest("base64url").slice(0, 32);
}
export function checkUnsubToken(userId: string, token: string) {
  const want = Buffer.from(unsubToken(userId));
  const got = Buffer.from(token);
  return want.length === got.length && timingSafeEqual(want, got);
}
export function unsubUrl(userId: string) {
  return `${siteBase()}/unsubscribe?u=${encodeURIComponent(userId)}&t=${unsubToken(userId)}`;
}

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

type GameWeek = {
  id: string;
  name: string;
  players: number;
  minutes: number;
  avg: number | null;
  ratings: number;
  names: string[];
  quotes: string[];
};

export type Report = { to: string; subject: string; text: string; html: string; headers: Record<string, string> };

/** Builds one developer's report, or null when they have no live game (or turned the email off). */
export async function buildReport(userId: string, now = new Date()): Promise<Report | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      displayName: true,
      credits: true,
      games: {
        where: { hiddenAt: null },
        select: { id: true, name: true, campaigns: { where: { status: "ACTIVE" }, select: { targetPlayers: true, delivered: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!user || !user.games.length) return null;

  const since = new Date(now.getTime() - WEEK_MS);
  const plays = await db.playTask.findMany({
    where: { gameId: { in: user.games.map((g) => g.id) }, status: "COMPLETED", completedAt: { gte: since, lte: now } },
    select: { gameId: true, playedSeconds: true, rating: true, feedback: true, player: { select: { displayName: true, robloxUsername: true } } },
    orderBy: { completedAt: "desc" },
  });

  const games: GameWeek[] = user.games.map((g) => {
    const mine = plays.filter((p) => p.gameId === g.id);
    const rated = mine.filter((p) => p.rating != null);
    return {
      id: g.id,
      name: g.name,
      players: mine.length,
      minutes: Math.round(mine.reduce((a, p) => a + p.playedSeconds, 0) / 60),
      avg: rated.length ? rated.reduce((a, p) => a + (p.rating ?? 0), 0) / rated.length : null,
      ratings: rated.length,
      names: [...new Set(mine.map((p) => p.player.robloxUsername || p.player.displayName))].slice(0, 6),
      quotes: mine.map((p) => p.feedback?.trim() ?? "").filter((f) => f.length > 0).slice(0, 2).map((f) => (f.length > 200 ? `${f.slice(0, 197)}...` : f)),
    };
  });
  const total = games.reduce((a, g) => a + g.players, 0);
  const queued = user.games.reduce((a, g) => a + g.campaigns.reduce((b, c) => b + Math.max(0, c.targetPlayers - c.delivered), 0), 0);

  const base = siteBase();
  const unsub = unsubUrl(user.id);
  const playUrl = `${base}/play`;

  const subject =
    total === 0
      ? "Your Spawnswap week"
      : user.games.length === 1
        ? `${plural(total, "person", "people")} played ${games[0].name} this week`
        : `${plural(total, "person", "people")} played your games this week`;

  // ---- plain text ----
  const t: string[] = [`Hi ${user.displayName},`, ""];
  if (total === 0) t.push("Nobody finished a 10-minute play on your games from Spawnswap this week.", "");
  else t.push(`Here's who played your games from Spawnswap in the last 7 days. Every play is verified: 10+ minutes in your game.`, "");
  for (const g of games) {
    if (!g.players && total) continue;
    t.push(`${g.name}: ${plural(g.players, "player")}, ${plural(g.minutes, "minute")} played${g.avg != null ? `, ${g.avg.toFixed(1)} stars (${plural(g.ratings, "rating")})` : ""}`);
    if (g.names.length) t.push(`  Played by: ${g.names.join(", ")}`);
    for (const q of g.quotes) t.push(`  "${q}"`);
    t.push(`  ${base}/dashboard/games/${g.id}`, "");
  }
  t.push(`You have ${plural(user.credits, "credit")}.${queued ? ` ${plural(queued, "player")} still on the way to your games.` : ""}`);
  t.push(`Every game you play for 10 minutes earns 1 credit = 1 more player for your game: ${playUrl}`, "");
  t.push("Spawnswap", "", `You get this because you have a game on Spawnswap. Stop these emails: ${unsub}`);
  const text = t.join("\n");

  // ---- html ----
  const lime = "#c8f031";
  const card = (g: GameWeek) => `
<tr><td style="padding:14px 0;border-top:1px solid #e5e7eb">
  <div style="font-size:16px;font-weight:700;color:#0b1426">${esc(g.name)}</div>
  <div style="margin-top:4px;font-size:14px;color:#334155"><b style="font-size:22px;color:#0b1426">${g.players}</b> ${g.players === 1 ? "player" : "players"} &nbsp;·&nbsp; ${plural(g.minutes, "minute")} played${g.avg != null ? ` &nbsp;·&nbsp; ★ ${g.avg.toFixed(1)} <span style="color:#64748b">(${plural(g.ratings, "rating")})</span>` : ""}</div>
  ${g.names.length ? `<div style="margin-top:6px;font-size:13px;color:#64748b">Played by ${g.names.map(esc).join(", ")}</div>` : ""}
  ${g.quotes.map((q) => `<div style="margin-top:8px;padding-left:10px;border-left:3px solid ${lime};font-size:13px;color:#334155">&ldquo;${esc(q)}&rdquo;</div>`).join("")}
  <div style="margin-top:8px;font-size:13px"><a href="${base}/dashboard/games/${g.id}" style="color:#0b1426">See all plays &rarr;</a></div>
</td></tr>`;
  const shown = total ? games.filter((g) => g.players) : games;
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;color:#0b1426">
<div style="background:#0b1426;color:#fff;padding:22px 24px;border-radius:12px">
  <div style="font-size:13px;color:${lime};font-weight:700;letter-spacing:.04em">SPAWNSWAP · YOUR WEEK</div>
  <div style="margin-top:6px;font-size:26px;font-weight:800">${total ? `${plural(total, "person", "people")} played your ${user.games.length === 1 ? "game" : "games"}` : "No plays this week yet"}</div>
  <div style="margin-top:4px;font-size:14px;color:#cbd5e1">${total ? "Verified plays from Spawnswap in the last 7 days. Each one is 10+ minutes in your game." : "Nobody finished a 10-minute play on your games from Spawnswap this week."}</div>
</div>
<p style="font-size:14px;margin:18px 0 4px">Hi ${esc(user.displayName)},</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${shown.map(card).join("")}</table>
<div style="margin-top:8px;padding:16px;background:#f4f7ec;border-radius:10px;font-size:14px;color:#334155">
  You have <b>${plural(user.credits, "credit")}</b>.${queued ? ` ${plural(queued, "player")} still on the way to your games.` : ""}<br>
  Every game you play for 10 minutes earns 1 credit = 1 more player for your game.
  <div style="margin-top:12px"><a href="${playUrl}" style="display:inline-block;padding:10px 18px;background:${lime};color:#061427;border-radius:8px;text-decoration:none;font-weight:700">Play a game, earn a credit</a></div>
</div>
<p style="margin-top:22px;font-size:12px;color:#94a3b8">You get this every Friday because you have a game on Spawnswap. <a href="${unsub}" style="color:#94a3b8">Stop these emails</a>.</p>
</div>`;

  const apiUnsub = `${base}/api/unsubscribe?u=${encodeURIComponent(user.id)}&t=${unsubToken(user.id)}`;
  return {
    to: user.email,
    subject,
    text,
    html,
    headers: { "List-Unsubscribe": `<${apiUnsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
  };
}

/** Sends this week's report to every developer who hasn't had one in the last 6 days. */
export async function sendWeeklyReports(now = new Date()) {
  if (!emailEnabled()) return { sent: 0, skipped: 0, failed: 0, note: "RESEND_API_KEY not set" };
  const devs = await db.user.findMany({
    where: {
      weeklyReport: true,
      games: { some: { hiddenAt: null } },
      OR: [{ weeklyReportSentAt: null }, { weeklyReportSentAt: { lt: new Date(now.getTime() - MIN_GAP_MS) } }],
    },
    select: { id: true },
    take: 500,
  });
  let sent = 0, skipped = 0, failed = 0;
  for (const d of devs) {
    // Claim the week first, so two runs at once can't both email the same person.
    const claimed = await db.user.updateMany({
      where: { id: d.id, OR: [{ weeklyReportSentAt: null }, { weeklyReportSentAt: { lt: new Date(now.getTime() - MIN_GAP_MS) } }] },
      data: { weeklyReportSentAt: now },
    });
    if (!claimed.count) { skipped++; continue; }
    const r = await buildReport(d.id, now).catch((e) => { console.error("weekly report build failed", d.id, e); return null; });
    if (!r) { skipped++; continue; }
    const ok = await sendEmail(r.to, r.subject, r.text, r.html, r.headers);
    if (ok) sent++;
    else {
      failed++;
      // Let the next run try again.
      await db.user.update({ where: { id: d.id }, data: { weeklyReportSentAt: null } }).catch(() => {});
    }
    // Resend allows a couple of emails a second.
    await new Promise((res) => setTimeout(res, 600));
  }
  return { sent, skipped, failed };
}
