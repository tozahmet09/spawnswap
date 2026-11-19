"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { playSfx } from "./Sfx";

/**
 * Keeps "My progress" live without a page refresh:
 * - asks /api/play/status every 10 s for the saved playtime,
 * - lets the clock run second by second in between while the player is in the game,
 * - nudges the Roblox presence check once a minute (backup for the cron),
 * - plays the completion moment the instant a game hits the playtime.
 */
export type Snap = {
  id: string;
  status: string;
  playedSeconds: number;
  lastPingAt: number | null;
  presenceCheckedAt: number | null;
  completedAt: number | null;
};
type Info = { id: string; name: string };

const POLL_MS = 10_000;
const PRESENCE_MS = 60_000;
// Checks come about once a minute; the clock keeps running this long after the last "in game" answer.
const LIVE_FOR_S = 95;
const CELEBRATED = "ss-celebrated";

type Ctx = { snaps: Map<string, Snap>; offset: number; now: number };
const LiveCtx = createContext<Ctx | null>(null);

function seen(): string[] {
  try {
    return JSON.parse(sessionStorage.getItem(CELEBRATED) ?? "[]");
  } catch {
    return [];
  }
}
function markSeen(id: string) {
  try {
    sessionStorage.setItem(CELEBRATED, JSON.stringify([...seen(), id].slice(-30)));
  } catch {
    // private window: it may celebrate again after a reload, which is harmless
  }
}

export function LivePlay({
  initial,
  games,
  required,
  watchPresence,
  serverNow,
  children,
}: {
  initial: Snap[];
  games: Info[];
  required: number;
  watchPresence: boolean;
  serverNow: number;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [snaps, setSnaps] = useState(() => new Map(initial.map((s) => [s.id, s])));
  // Server clock minus this device's clock, so a phone set a minute off still counts right.
  const [offset, setOffset] = useState(() => serverNow - Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [party, setParty] = useState<Info | null>(null);
  const snapsRef = useRef(snaps);
  snapsRef.current = snaps;
  const names = useRef(new Map(games.map((g) => [g.id, g])));
  names.current = new Map(games.map((g) => [g.id, g]));

  // A play that finished in the last moments before this page opened still gets its moment.
  useEffect(() => {
    const done = seen();
    const fresh = initial.find((s) => s.status === "COMPLETED" && s.completedAt && serverNow - s.completedAt < 20_000 && !done.includes(s.id));
    if (fresh) {
      markSeen(fresh.id);
      setParty(names.current.get(fresh.id) ?? { id: fresh.id, name: "" });
    }
    // only on first open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // New server render (e.g. after router.refresh): take its numbers.
  useEffect(() => {
    setSnaps((old) => {
      const next = new Map(old);
      for (const s of initial) next.set(s.id, s);
      return next;
    });
  }, [initial]);

  const pull = useCallback(async () => {
    try {
      const r = await fetch("/api/play/status", { cache: "no-store" });
      if (!r.ok) return;
      const data = (await r.json()) as { now: number; tasks: Snap[] };
      setOffset(data.now - Date.now());
      const before = snapsRef.current;
      let finished: Info | null = null;
      let changed = false;
      for (const s of data.tasks) {
        const was = before.get(s.id);
        if (!was) {
          changed = true;
          continue;
        }
        if (was.status !== s.status) changed = true;
        if (was.status === "PENDING" && s.status === "COMPLETED" && !seen().includes(s.id)) {
          markSeen(s.id);
          finished = names.current.get(s.id) ?? { id: s.id, name: "" };
        }
      }
      setSnaps(new Map(data.tasks.map((s) => [s.id, s])));
      if (finished) setParty(finished);
      // Status changes (finished, expired) re-render the list from the server: rating form, credit counter.
      if (changed) router.refresh();
    } catch {
      // offline for a moment: next poll will catch up
    }
  }, [router]);

  useEffect(() => {
    const id = setInterval(pull, POLL_MS);
    const onShow = () => document.visibilityState === "visible" && pull();
    document.addEventListener("visibilitychange", onShow);
    window.addEventListener("focus", onShow);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onShow);
      window.removeEventListener("focus", onShow);
    };
  }, [pull]);

  // Backup for the once-a-minute cron: ask Roblox ourselves while a script-free game is going.
  useEffect(() => {
    if (!watchPresence) return;
    let stop = false;
    const tick = async () => {
      try {
        const r = await fetch("/api/presence", { method: "POST" });
        if (!stop && r.ok) pull();
      } catch {
        // try again next minute
      }
    };
    tick();
    const id = setInterval(tick, PRESENCE_MS);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [watchPresence, pull]);

  // One-second clock for the running timers.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <LiveCtx.Provider value={{ snaps, offset, now }}>
      {children}
      {party && <Celebrate key={party.id} name={party.name} minutes={Math.round(required / 60)} onDone={() => setParty(null)} />}
    </LiveCtx.Provider>
  );
}

/** Seconds to show right now: saved seconds, plus the time since the last "in game" answer while it's fresh. */
function liveSeconds(s: Snap, serverNow: number, required: number) {
  const inGame = s.lastPingAt !== null && (s.presenceCheckedAt === null || s.presenceCheckedAt <= s.lastPingAt);
  const since = inGame ? (serverNow - s.lastPingAt!) / 1000 : Infinity;
  const live = since >= 0 && since <= LIVE_FOR_S;
  // Never show the goal reached before the server has actually counted it.
  const shown = Math.min(required - 1, s.playedSeconds + (live ? Math.floor(since) : 0));
  return { shown: Math.max(0, shown), live };
}

const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;

export function LiveProgress({ id, required, fallback }: { id: string; required: number; fallback: number }) {
  const ctx = useContext(LiveCtx);
  const s = ctx?.snaps.get(id);
  const { shown, live } = s && ctx ? liveSeconds(s, ctx.now + ctx.offset, required) : { shown: fallback, live: false };
  const pct = Math.min(100, (shown / required) * 100);
  return (
    <div className="mt-2 flex items-center gap-3">
      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-line">
        <div
          className={`relative h-full rounded-full bg-lime transition-[width] duration-1000 ease-linear ${live ? "shadow-[0_0_12px_rgba(200,240,49,.55)]" : ""}`}
          style={{ width: `${Math.max(pct, 3)}%` }}
        >
          {live && <span className="absolute inset-y-0 right-0 w-8 animate-pulse rounded-full bg-white/50 blur-[3px]" />}
        </div>
      </div>
      <span className="inline-flex w-[7.5rem] items-center justify-end gap-1.5 text-xs tabular-nums text-mute">
        {live ? (
          <span className="relative flex h-1.5 w-1.5" aria-hidden>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-lime opacity-70" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-lime" />
          </span>
        ) : (
          shown > 0 && <span className="text-faint">paused</span>
        )}
        <span className={live ? "text-cream" : ""}>{clock(shown)}</span>
        <span className="text-faint">/ {clock(required)}</span>
      </span>
    </div>
  );
}

/** The "you did it" moment: ring closes, light wave, sparks, +1 credit. About 3 seconds, tap to skip. */
function Celebrate({ name, minutes, onDone }: { name: string; minutes: number; onDone: () => void }) {
  const [leaving, setLeaving] = useState(false);
  // The parent re-renders every second (timer): keep the latest onDone without restarting the moment.
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    playSfx("complete");
    const a = setTimeout(() => setLeaving(true), 2900);
    const b = setTimeout(() => done.current(), 3400);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, []);
  const R = 58;
  const C = 2 * Math.PI * R;
  const sparks = Array.from({ length: 22 }, (_, i) => {
    const a = (i / 22) * Math.PI * 2 + (i % 2) * 0.12;
    const r = 120 + (i % 4) * 26;
    return { dx: `${Math.cos(a) * r}px`, dy: `${Math.sin(a) * r}px`, d: `${640 + (i % 5) * 35}ms`, s: i % 3 === 0 ? 8 : 5 };
  });
  // Rendered on <body> so it sits above the header and footer.
  return createPortal(
    <div
      role="status"
      aria-live="polite"
      onClick={() => done.current()}
      className={`fixed inset-0 z-[100] flex cursor-pointer items-center justify-center bg-[#060c18]/80 backdrop-blur-sm transition-opacity duration-500 ${leaving ? "opacity-0" : "animate-fade"}`}
    >
      <div className="relative flex flex-col items-center">
        <div className="relative h-[180px] w-[180px]">
          {/* soft rotating light behind the ring */}
          <div className="celebrate-rays absolute -inset-24 rounded-full opacity-0" />
          <div className="celebrate-glow absolute inset-0 rounded-full" />
          {/* shockwaves */}
          <span className="celebrate-wave absolute inset-0 rounded-full border-2 border-lime" />
          <span className="celebrate-wave absolute inset-0 rounded-full border border-lime/60 [animation-delay:820ms]" />
          {sparks.map((s, i) => (
            <span
              key={i}
              className="celebrate-spark absolute left-1/2 top-1/2 rounded-full bg-lime shadow-[0_0_10px_#c8f031]"
              style={{ width: s.s, height: s.s, marginLeft: -s.s / 2, marginTop: -s.s / 2, ["--dx" as string]: s.dx, ["--dy" as string]: s.dy, animationDelay: s.d }}
            />
          ))}
          <svg viewBox="0 0 140 140" className="absolute inset-0 h-full w-full -rotate-90">
            <circle cx="70" cy="70" r={R} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="6" />
            <circle
              cx="70" cy="70" r={R} fill="none" stroke="#c8f031" strokeWidth="6" strokeLinecap="round"
              className="celebrate-ring" style={{ strokeDasharray: C, ["--c" as string]: C }}
            />
          </svg>
          <svg viewBox="0 0 140 140" className="absolute inset-0 h-full w-full">
            <path d="M48 72 L63 87 L94 55" fill="none" stroke="#c8f031" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" className="celebrate-check" />
          </svg>
        </div>
        <p className="celebrate-text mt-8 font-display text-5xl font-bold text-lime [text-shadow:0_0_28px_rgba(200,240,49,.55)]">+1 credit</p>
        <p className="celebrate-sub mt-2 max-w-sm px-6 text-center text-sm text-mute">
          {name ? <>You played <span className="text-cream">{name}</span> for {minutes} min</> : <>{minutes} minutes played</>}
        </p>
      </div>
    </div>,
    document.body,
  );
}
