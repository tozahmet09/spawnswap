"use client";

import { useSyncExternalStore } from "react";

/**
 * Credits already paid on the server but not "handed over" on screen yet.
 * A finished play pays at 10 minutes (so nobody loses it by closing the tab), but the header
 * counter waits and only counts it up in the completion moment, after the player rates or skips.
 */
let held = new Set<string>();
const released = new Set<string>();
// Rated just now, moment still playing: keep holding even though the server says it's rated.
const keep = new Set<string>();
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export function holdCredits(ids: string[]) {
  const next = new Set([...ids, ...keep].filter((id) => !released.has(id)));
  if (next.size === held.size && [...next].every((id) => held.has(id))) return;
  held = next;
  emit();
}

export function releaseCredit(id: string) {
  released.add(id);
  keep.delete(id);
  if (held.delete(id)) emit();
}

/** Leaving the progress page: show the real balance everywhere else. */
export function clearHolds() {
  keep.clear();
  held = new Set();
  emit();
}

export function useHeldCredits() {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => held.size,
    () => 0,
  );
}

/** Asks the progress page to play the completion moment for this play. */
export function celebrate(id: string, name: string) {
  if (held.has(id)) keep.add(id);
  window.dispatchEvent(new CustomEvent("ss-celebrate", { detail: { id, name } }));
}
