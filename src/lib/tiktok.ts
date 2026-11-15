/**
 * Turns what a dev typed ("@name", "name", or a tiktok.com/@name link) into a bare TikTok username.
 * Returns "" for empty input and null when it isn't a valid username (letters, numbers, _ and ., 2 to 24 long).
 */
export function parseTiktokHandle(input: string): string | null {
  let s = input.trim();
  if (!s) return "";
  const m = s.match(/tiktok\.com\/@([^/?#\s]+)/i);
  if (m) s = m[1];
  s = s.replace(/^@/, "");
  if (!/^[a-zA-Z0-9_.]{2,24}$/.test(s) || s.endsWith(".")) return null;
  return s;
}

export const TIKTOK_ERROR = "That TikTok username doesn't look right. Use letters, numbers, _ or . like @mystudio.";
