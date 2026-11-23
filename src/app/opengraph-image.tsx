import { ImageResponse } from "next/og";

export const alt = "Spawnswap: add your Roblox game, we play it on TikTok";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Share image for links on Discord, X, etc. Same look as the site: dark, one amber accent, no decoration. */
export default function OgImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#061427", padding: 80, color: "#f2f5ec", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 34, fontWeight: 700 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: "#c8f031", color: "#061427", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, fontWeight: 800 }}>S</div>
          Spawnswap
        </div>
        <div style={{ display: "flex", flexDirection: "column", fontSize: 76, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2 }}>
          <div>Add your Roblox game.</div>
          <div style={{ color: "#c8f031" }}>We play it on TikTok.</div>
        </div>
        <div style={{ display: "flex", fontSize: 28, color: "#bdb6ab" }}>
          <span style={{ color: "#c8f031", marginRight: 12 }}>Free.</span> Sign up, paste your Roblox link, we show it to real players.
        </div>
      </div>
    ),
    size,
  );
}
