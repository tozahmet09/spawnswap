"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { rateLimit } from "@/lib/ratelimit";
import { sendEmail } from "@/lib/email";
import {
  ABOUT_MAX, INSTRUCTIONS_MAX, MESSAGE_MAX, POST_MAX, PLATFORMS, REQUESTS_PER_DAY,
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

// ---------- role ----------

/** Switches what the account is for. Creators land on the Social media tab, devs on My Games. */
export async function setRole(f: FormData) {
  const user = await requireUser();
  const role = str(f, "role") === "CREATOR" ? "CREATOR" : "DEV";
  await db.user.update({ where: { id: user.id }, data: { role } });
  revalidatePath("/", "layout");
  redirect(role === "CREATOR" ? "/social/profile" : "/dashboard");
}

// ---------- profiles ----------

/** Creates or updates the creator's card on the Social media tab. Only adults are listed, because devs pay them. */
export async function saveCreatorProfile(_: FormState, f: FormData): Promise<FormState> {
  const user = await requireUser();
  const platform = str(f, "platform");
  if (!isPlatform(platform)) return { error: "Pick TikTok or YouTube." };
  const handle = parseCreatorHandle(platform, str(f, "handle"));
  if (!handle) return { error: `Enter your ${PLATFORMS[platform]} username, like @yourname.` };
  const followers = Number(str(f, "followers").replace(/[,\s]/g, ""));
  if (!Number.isInteger(followers) || followers < 0 || followers > 1e9) return { error: "Enter your follower count as a number." };
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
  return { ok: data.hidden ? "Saved. Your card is hidden from the list." : "Saved. Devs can see your card now." };
}

/** A dev's post on the Social media tab: what kind of video they're looking for. Empty text takes the post down. */
export async function saveDevPost(_: FormState, f: FormData): Promise<FormState> {
  const user = await requireUser();
  const post = str(f, "post");
  if (post.length > POST_MAX) return { error: `Keep it under ${POST_MAX} characters.` };
  if (post && post.length < 10) return { error: "Write a bit more, like what game and what kind of video." };
  if (post && !(await db.game.count({ where: { ownerId: user.id, hiddenAt: null } })))
    return { error: "Add a game first, so creators know what they would show." };
  await db.user.update({ where: { id: user.id }, data: post ? { devPost: post, devPostAt: user.devPost ? user.devPostAt : new Date() } : { devPost: null, devPostAt: null } });
  revalidatePath("/social");
  return { ok: post ? "Posted. Creators can see it and offer a video." : "Post removed." };
}

// ---------- requests ----------

/** A creator offers to make a video for a dev. The dev accepts by picking the game and writing instructions. */
export async function offerVideo(_: FormState, f: FormData): Promise<FormState> {
  const user = await requireUser();
  const me = await db.creatorProfile.findUnique({ where: { userId: user.id } });
  if (!me) return { error: "Make your creator card first." };
  if (me.hidden) return { error: "Your creator card is hidden. Show it first, so the dev can see who you are." };
  const dev = await db.user.findUnique({ where: { id: str(f, "devId") }, select: { id: true, email: true, displayName: true } });
  if (!dev || dev.id === user.id) return { error: "That developer wasn't found." };
  const message = str(f, "message");
  if (message.length < 5) return { error: "Write a short message." };
  if (message.length > MESSAGE_MAX) return { error: `Keep it under ${MESSAGE_MAX} characters.` };
  if (await db.videoRequest.count({ where: { creatorId: me.id, devId: dev.id, status: "PENDING" } }))
    return { error: "You already have a request waiting with this developer." };
  if (!(await rateLimit(`video-req:${user.id}`, REQUESTS_PER_DAY, 24 * 3600e3))) return { error: TOO_MANY };
  await db.videoRequest.create({ data: { creatorId: me.id, devId: dev.id, fromRole: "CREATOR", message } });
  const url = await siteUrl();
  await notify(
    dev.email,
    `@${me.handle} wants to make a video about your game`,
    [`Hi ${dev.displayName},`, `@${me.handle} (${PLATFORMS[me.platform as keyof typeof PLATFORMS]}) wants to make a video about your game on Spawnswap:`, `"${message}"`, "Open your requests to accept and pick which game they should show, with your own instructions."],
    { label: "See the request", href: `${url}/social/requests` },
  );
  revalidatePath("/social/requests");
  return { ok: "Sent. You'll get an email when the developer answers." };
}

/** A dev asks a creator for a video, with the game and instructions filled in. The creator accepts or declines. */
export async function askForVideo(_: FormState, f: FormData): Promise<FormState> {
  const user = await requireUser();
  const creator = await db.creatorProfile.findUnique({ where: { id: str(f, "creatorId") }, include: { user: { select: { email: true } } } });
  if (!creator || creator.hidden || creator.userId === user.id) return { error: "That creator wasn't found." };
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

/** Accept or decline a request sent to you. A dev accepting a creator's offer picks the game and writes instructions. */
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
