"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Ticket } from "lucide-react";
import { playSfx } from "./Sfx";
import { dropWelcomeSoon, holdWelcome, releaseWelcome } from "./creditHold";

const COUNT_AT = 850; // first credit counts in
const STEP = 130; // then one every STEP ms
const TAP_OK = 1200; // ignore taps before this, so the redirect click doesn't skip it

/**
 * Right after signup: the welcome credits arrive on screen. Ring closes, the credit ticket pops,
 * the number counts up one by one with coin blips, then a light burst and the header counter ticks up.
 * About 4 seconds, tap to skip. Same look as the +1 credit moment after a play.
 */
export function WelcomeMoment({ credits }: { credits: number }) {
  const [open, setOpen] = useState(true);
  const [leaving, setLeaving] = useState(false);
  const [n, setN] = useState(0);
  const [mounted, setMounted] = useState(false);
  const started = useRef(0);
  const burstAt = COUNT_AT + (credits - 1) * STEP + 200;

  // Before the first paint: the header shows the balance without the gift until it's handed over.
  useLayoutEffect(() => {
    holdWelcome(credits);
    return () => dropWelcomeSoon();
  }, [credits]);

  useEffect(() => {
    setMounted(true);
    started.current = Date.now();
    // A reload shouldn't play it again. (Not router.replace: that re-renders the page without this moment.)
    window.history.replaceState(null, "", "/dashboard");
    playSfx("welcome");
    const timers = [
      ...Array.from({ length: credits }, (_, i) => setTimeout(() => setN(i + 1), COUNT_AT + i * STEP)),
      setTimeout(() => releaseWelcome(), burstAt),
      setTimeout(() => setLeaving(true), burstAt + 2600),
      setTimeout(() => setOpen(false), burstAt + 3100),
    ];
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = () => {
    if (Date.now() - started.current < TAP_OK) return;
    releaseWelcome();
    setOpen(false);
  };

  if (!open || !mounted) return null;

  const R = 58;
  const C = 2 * Math.PI * R;
  const sparks = Array.from({ length: 26 }, (_, i) => {
    const a = (i / 26) * Math.PI * 2 + (i % 2) * 0.12;
    const r = 120 + (i % 4) * 28;
    return { dx: `${Math.cos(a) * r}px`, dy: `${Math.sin(a) * r}px`, d: `${burstAt - 60 + (i % 5) * 35}ms`, s: i % 3 === 0 ? 8 : 5 };
  });
  const burst = { animationDelay: `${burstAt}ms` };

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      onClick={close}
      className={`fixed inset-0 z-[100] flex cursor-pointer items-center justify-center bg-[#060c18]/85 backdrop-blur-sm transition-opacity duration-500 ${leaving ? "opacity-0" : "animate-fade"}`}
    >
      <div className="relative flex flex-col items-center">
        <p className="celebrate-sub mb-6 text-xs font-semibold uppercase tracking-[.18em] text-lime/80" style={{ animationDelay: "250ms" }}>
          Welcome gift
        </p>
        <div className="relative h-[180px] w-[180px]">
          <div className="celebrate-rays absolute -inset-24 rounded-full opacity-0" style={burst} />
          <div className="celebrate-glow absolute inset-0 rounded-full" style={{ animationDelay: `${COUNT_AT - 200}ms` }} />
          <span className="celebrate-wave absolute inset-0 rounded-full border-2 border-lime" style={burst} />
          <span className="celebrate-wave absolute inset-0 rounded-full border border-lime/60" style={{ animationDelay: `${burstAt + 120}ms` }} />
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
          <div className="welcome-ticket absolute inset-0 flex items-center justify-center">
            {/* re-key on every count so the ticket bumps with each credit */}
            <Ticket
              key={n}
              className={`h-16 w-16 text-lime drop-shadow-[0_0_14px_rgba(200,240,49,.75)] ${n > 0 ? "animate-pop" : ""}`}
              strokeWidth={1.8}
              aria-hidden
            />
          </div>
        </div>
        <p className="celebrate-text mt-8 font-display text-5xl font-bold tabular-nums text-lime [text-shadow:0_0_28px_rgba(200,240,49,.55)]">
          +{Math.max(n, 1)} credit{Math.max(n, 1) === 1 ? "" : "s"}
        </p>
        <p className="celebrate-sub mt-3 max-w-xs px-6 text-center text-sm text-mute" style={{ animationDelay: `${burstAt}ms` }}>
          Welcome to Spawnswap! Each credit brings one real player to your game.
        </p>
        <span className="sr-only">You got {credits} free credits.</span>
      </div>
    </div>,
    document.body,
  );
}
