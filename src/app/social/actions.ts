"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { rateLimit } from "@/lib/ratelimit";
import { sendEmail } from "@/lib/email";
import {
  ABOUT_MAX, INSTRUCTIONS_MAX, MESSAGE_MAX, MIN_FOLLOWERS, PLATFORMS, REQUESTS_PER_DAY,
  creatorUrl, isPlatform, parseCreatorHandle,
} from "@/lib/creators";
import type { FormState } from "@/app/actions";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const TOO_MANY = `You can send ${REQUESTS_PER_DAY} requests a day. Try again tomorrow.`;

async function siteUrl() {
  const fromEnv = process.env.APP_URL?.trim().replace(/\/+$/, "");
  if (fromEnv) return fromEnv;
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Plain email with one button. Lines are escaped; the link is ours. */
async function notify(to: string, subject: string, lines: string[], button: { label: string; href: string }) {
  const text = `${lines.join("\n\n")}\n\n${button.label}: ${button.href}`;
  const html =
    lines.map((l) => `<p>${esc(l).replace(/\n/g, "<br>")}</p>`).join("") +
    `<p><a href="${button.href}" style="display:inline-block;padding:10px 18px;background:#c8f031;color:#061427;border-radius:8px;text-decoration:none;font-weight:600">${esc(button.label)}</a></p>`;
  await sendEmail(to, subject, text, html);
}

// ---------- profiles ----------

/** Creates or updates the creator's listing on the Social media tab. Any account can have one (devs can be creators too). Only adults are listed, because devs pay them. */
export async function saveCreatorProfile(_: FormState, f: FormData): Promise<FormState> {
  const user = await requireUser();
  const platform = str(f, "platform");
  if (!isPlatform(platform)) return { error: "Pick TikTok or YouTube." };
  const handle = parseCreatorHandle(platform, str(f, "handle"));
  if (!handle) return { error: `Enter your ${PLATFORMS[platform]} username, like @yourname.` };
  const followers = Number(str(f, "followers").replace(/[,\s]/g, ""));
  if (!Number.isInteger(followers) || followers < 0 || followers > 1e9) return { error: "Enter your follower count as a number." };
  if (followers < MIN_FOLLOWERS) return { error: `You need at least ${MIN_FOLLOWERS.toLocaleString("en-US")} followers to post a listing.` };
  const priceRaw = str(f, "price").replace(/^\$/, "");
  const priceUsd = priceRaw === "" ? null : Number(priceRaw);
  if (priceUsd !== null && (!Number.isInteger(priceUsd) || priceUsd < 0 || priceUsd > 100000))
    return { error: "Enter your price in whole dollars, or leave it empty." };
  const about = str(f, "about");
  if (about.length < 10) return { error: "Say in a sentence what games you promote." };
  if (about.length > ABOUT_MAX) return { error: `Keep it under ${ABOUT_MAX} characters.` };
  if (f.get("adult") !== "on") return { error: "Only creators who are 18 or older can be listed." };
  const data = { platform, handle, followers, priceUsd, about, hidden: f.get("hidden") === "on" };
  await db.creatorProfile.upsert({
    where: { userId: user.id },
    create: { ...data, userId: user.id, adultAt: new Date() },
    update: data,
  });
  revalidatePath("/social");
  return { ok: data.hidden ? "Saved. Your listing is hidden." : "Saved. Devs can see your listing now." };
}

// ---------- requests ----------

/** A dev asks a creator for a video, with the game and instructions filled in. The creator accepts or declines. */
export async function askForVideo(_: FormState, f: FormData): Promise<FormState> {
  const user = await requireUser();
  const creator = await db.creatorProfile.findUnique({ where: { id: str(f, "creatorId") }, include: { user: { select: { email: true } } } });
  if (!creator || creator.hidden || creator.followers < MIN_FOLLOWERS || creator.userId === user.id) return { error: "That creator wasn't found." };
  const game = await db.game.findFirst({ where: { id: str(f, "gameId"), ownerId: user.id }, select: { id: true, name: true } });
  if (!game) return { error: "Pick one of your games." };
  const instructions = str(f, "instructions");
  if (instructions.length > INSTRUCTIONS_MAX) return { error: `Keep the instructions under ${INSTRUCTIONS_MAX} characters.` };
  const message = str(f, "message");
  if (message.length < 5) return { error: "Write a short message." };
  if (message.length > MESSAGE_MAX) return { error: `Keep it under ${MESSAGE_MAX} characters.` };
  if (await db.videoRequest.count({ where: { creatorId: creator.id, devId: user.id, status: "PENDING" } }))
    return { error: "You already have a request waiting with this creator." };
  if (!(await rateLimit(`video-req:${user.id}`, REQUESTS_PER_DAY, 24 * 3600e3))) return { error: TOO_MANY };
  await db.videoRequest.create({
    data: { creatorId: creator.id, devId: user.id, fromRole: "DEV", message, gameId: game.id, instructions: instructions || null },
  });
  const url = await siteUrl();
  await notify(
    creator.user.email,
    `${user.displayName} wants a video about ${game.name}`,
    [`Hi @${creator.handle},`, `${user.displayName} wants you to make a video about their Roblox game ${game.name}:`, `"${message}"`, "Open your requests to see the game and their instructions, then accept or decline."],
    { label: "See the request", href: `${url}/social/requests` },
  );
  revalidatePath("/social/requests");
  return { ok: "Sent. You'll get an email when the creator answers." };
}

/** Accept or decline a request sent to you. Older creator offers (fromRole CREATOR) are still answered by the dev, who picks the game. */
export async function answerRequest(_: FormState, f: FormData): Promise<FormState> {
  const user = await requireUser();
  const req = await db.videoRequest.findUnique({
    where: { id: str(f, "id") },
    include: { creator: { include: { user: { select: { id: true, email: true } } } }, dev: { select: { id: true, email: true, displayName: true } } },
  });
  if (!req || req.status !== "PENDING") return { error: "This request was already answered." };
  // Only the side that didn't send it can answer.
  const answerer = req.fromRole === "CREATOR" ? req.dev.id : req.creator.userId;
  if (answerer !== user.id) return { error: "This request isn't yours to answer." };
  const url = await siteUrl();
  const sender = req.fromRole === "CREATOR" ? req.creator.user.email : req.dev.email;

  if (str(f, "answer") !== "accept") {
    await db.videoRequest.update({ where: { id: req.id }, data: { status: "DECLINED", decidedAt: new Date() } });
    await notify(sender, "Your video request was declined", ["Your video request on Spawnswap was declined. No worries, there are more on the Social media tab."], { label: "Open Social media", href: `${url}/social` });
    revalidatePath("/social/requests");
    return { ok: "Declined." };
  }

  let gameId = req.gameId;
  let instructions = req.instructions;
  if (req.fromRole === "CREATOR") {
    const game = await db.game.findFirst({ where: { id: str(f, "gameId"), ownerId: user.id }, select: { id: true } });
    if (!game) return { error: "Pick which game they should show." };
    instructions = str(f, "instructions") || null;
    if (instructions && instructions.length > INSTRUCTIONS_MAX) return { error: `Keep the instructions under ${INSTRUCTIONS_MAX} characters.` };
    gameId = game.id;
  }
  const r = await db.videoRequest.updateMany({
    where: { id: req.id, status: "PENDING" },
    data: { status: "ACCEPTED", decidedAt: new Date(), gameId, instructions },
  });
  if (r.count !== 1) return { error: "This request was already answered." };

  const game = gameId ? await db.game.findUnique({ where: { id: gameId }, select: { id: true, name: true, placeId: true } }) : null;
  const gameLine = game ? `Game: ${game.name}\n${url}/games/${game.id}\nRoblox: https://www.roblox.com/games/${game.placeId}` : "";
  const how = "Agree on the price and the date between you. Spawnswap doesn't take a cut. Paid videos must say #ad or use the paid partnership label.";
  await notify(
    req.creator.user.email,
    game ? `It's on: video about ${game.name}` : "Your video request was accepted",
    [`${req.dev.displayName} and you agreed on a video.`, gameLine, instructions ? `Their instructions:\n${instructions}` : "", `Reach the developer at: ${req.dev.email}`, how].filter(Boolean),
    { label: "See it on Spawnswap", href: `${url}/social/requests` },
  );
  await notify(
    req.dev.email,
    `It's on: @${req.creator.handle} will make your video`,
    [`@${req.creator.handle} and you agreed on a video.`, gameLine, `Their channel: ${creatorUrl(req.creator.platform, req.creator.handle)}`, `Reach them at: ${req.creator.user.email}`, how].filter(Boolean),
    { label: "See it on Spawnswap", href: `${url}/social/requests` },
  );
  revalidatePath("/social/requests");
  return { ok: "Accepted. We emailed you both each other's contact." };
}
