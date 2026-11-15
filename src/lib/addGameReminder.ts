import "server-only";
import { db } from "./db";
import { emailEnabled, sendEmail } from "./email";
import { EARLY_BIRD_ACCOUNTS, EARLY_BIRD_CREDITS } from "./money";
import { welcomeSpotsLeft } from "./welcome";
import { siteBase, unsubToken, unsubUrl } from "./weeklyReport";

/**
 * One email, about a day after signup, to people who made an account but never added a game:
 * their first game still earns the welcome credits. Only sent while welcome spots are left,
 * only once per account, and never to someone who turned Spawnswap emails off.
 */

// Wait about a day after signup, and don't dig up accounts older than two weeks.
const AFTER_MS = 20 * 3600e3;
const UP_TO_MS = 14 * 864e5;

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function buildAddGameReminder(user: { id: string; email: string; displayName: string }) {
  const base = siteBase();
  const add = `${base}/dashboard/games/new`;
  const unsub = unsubUrl(user.id);
  const apiUnsub = `${base}/api/unsubscribe?u=${encodeURIComponent(user.id)}&t=${unsubToken(user.id)}`;
  const subject = `Your ${EARLY_BIRD_CREDITS} free credits are waiting`;

  const text = [
    `Hi ${user.displayName},`,
    "",
    `Thanks for joining Spawnswap. You haven't added your game yet, so your ${EARLY_BIRD_CREDITS} welcome credits are still waiting.`,
    "",
    `They're a gift for the first ${EARLY_BIRD_ACCOUNTS} developers, and they arrive the moment you add your first game.`,
    "Each credit brings one real player who plays your game for 10+ minutes.",
    "",
    `Add your game (just paste the Roblox link): ${add}`,
    "",
    "Spawnswap",
    "",
    `You get this because you made a Spawnswap account. Stop these emails: ${unsub}`,
  ].join("\n");

  const lime = "#c8f031";
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;color:#0b1426">
<div style="background:#0b1426;color:#fff;padding:22px 24px;border-radius:12px">
  <div style="font-size:13px;color:${lime};font-weight:700;letter-spacing:.04em">SPAWNSWAP · WELCOME GIFT</div>
  <div style="margin-top:6px;font-size:26px;font-weight:800">Your ${EARLY_BIRD_CREDITS} free credits are waiting</div>
  <div style="margin-top:4px;font-size:14px;color:#cbd5e1">They arrive the moment you add your first game.</div>
</div>
<p style="font-size:14px;margin:18px 0 4px">Hi ${esc(user.displayName)},</p>
<p style="font-size:14px;line-height:1.55;color:#334155">Thanks for joining Spawnswap. You haven't added your game yet, so your welcome credits are still waiting.
They're a gift for the first ${EARLY_BIRD_ACCOUNTS} developers. Each credit brings one real player who plays your game for 10+ minutes.</p>
<div style="margin-top:16px"><a href="${add}" style="display:inline-block;padding:12px 20px;background:${lime};color:#061427;border-radius:8px;text-decoration:none;font-weight:700">Add my game</a></div>
<p style="font-size:13px;color:#64748b;margin-top:10px">Takes about a minute. Just paste the Roblox link.</p>
<p style="margin-top:22px;font-size:12px;color:#94a3b8">You get this because you made a Spawnswap account. <a href="${unsub}" style="color:#94a3b8">Stop these emails</a>.</p>
</div>`;

  return {
    to: user.email,
    subject,
    text,
    html,
    headers: { "List-Unsubscribe": `<${apiUnsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
  };
}

/** Sends the reminder to everyone who is due. Safe to run more than once a day. */
export async function sendAddGameReminders(now = new Date()) {
  if (!emailEnabled()) return { sent: 0, skipped: 0, failed: 0, note: "RESEND_API_KEY not set" };
  if (EARLY_BIRD_CREDITS <= 0 || (await welcomeSpotsLeft()) <= 0) return { sent: 0, skipped: 0, failed: 0, note: "no welcome spots left" };
  const due = {
    welcomeBonusPaid: false,
    weeklyReport: true,
    addGameReminderAt: null,
    games: { none: {} },
    createdAt: { lte: new Date(now.getTime() - AFTER_MS), gte: new Date(now.getTime() - UP_TO_MS) },
  };
  const users = await db.user.findMany({ where: due, select: { id: true, email: true, displayName: true }, take: 200 });
  let sent = 0, skipped = 0, failed = 0;
  for (const u of users) {
    // Claim first, so two runs at once can't both email the same person.
    const claimed = await db.user.updateMany({ where: { id: u.id, ...due }, data: { addGameReminderAt: now } });
    if (!claimed.count) { skipped++; continue; }
    const r = buildAddGameReminder(u);
    if (await sendEmail(r.to, r.subject, r.text, r.html, r.headers)) sent++;
    else {
      failed++;
      await db.user.update({ where: { id: u.id }, data: { addGameReminderAt: null } }).catch(() => {});
    }
    await new Promise((res) => setTimeout(res, 600));
  }
  return { sent, skipped, failed };
}
