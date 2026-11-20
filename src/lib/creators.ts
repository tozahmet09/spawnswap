import { parseTiktokHandle } from "@/lib/tiktok";

// Creators make TikTok / YouTube videos about Roblox games. They meet devs on the Social media tab (/social):
// either side sends a request, and once it is accepted we email both. Payment is between them for now.

export const PLATFORMS = { TIKTOK: "TikTok", YOUTUBE: "YouTube" } as const;
export type Platform = keyof typeof PLATFORMS;

export const isPlatform = (p: string): p is Platform => p in PLATFORMS;

/** Turns "@name", "name" or a channel link into a bare handle. "" for empty, null when it isn't valid. */
export function parseCreatorHandle(platform: Platform, input: string): string | null {
  if (platform === "TIKTOK") return parseTiktokHandle(input);
  let s = input.trim();
  if (!s) return "";
  const m = s.match(/youtube\.com\/@([^/?#\s]+)/i);
  if (m) s = decodeURIComponent(m[1]);
  s = s.replace(/^@/, "");
  // YouTube handles: 3 to 30 letters, numbers, _ - and .
  if (!/^[a-zA-Z0-9_.-]{3,30}$/.test(s)) return null;
  return s;
}

export function creatorUrl(platform: string, handle: string) {
  return platform === "YOUTUBE" ? `https://www.youtube.com/@${handle}` : `https://www.tiktok.com/@${handle}`;
}

export function formatFollowers(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, "")}K`;
  return String(n);
}

export const formatPrice = (usd: number | null) => (usd == null ? "Ask for price" : usd === 0 ? "Free" : `$${usd} / video`);

export const ABOUT_MAX = 300;
export const POST_MAX = 300;
export const MESSAGE_MAX = 500;
export const INSTRUCTIONS_MAX = 1000;
/** How many video requests one account can send per day (stops spam). */
export const REQUESTS_PER_DAY = 10;
