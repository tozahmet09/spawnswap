"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, Clapperboard } from "lucide-react";

// Pages that already say it in big type (or are the form itself).
const QUIET = ["/dashboard", "/dashboard/games/new", "/signup", "/login"];

/**
 * Thin line under the nav for signed-in users who haven't added a game yet.
 * Many people sign up and never add their game, so it never gets into the video line.
 */
export function WelcomeBar() {
  const path = usePathname();
  if (QUIET.includes(path)) return null;
  return (
    <Link
      href="/dashboard/games/new"
      className="group flex items-center justify-center gap-2 border-t border-lime/25 bg-lime/[.08] px-4 py-2 text-[13px] text-cream transition hover:bg-lime/[.14]"
    >
      <Clapperboard className="h-3.5 w-3.5 shrink-0 text-lime" aria-hidden />
      <span>
        <b className="font-semibold text-lime">Add your game</b>
        <span className="hidden sm:inline"> and we&apos;ll play it on TikTok</span>
      </span>
      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-lime transition group-hover:translate-x-0.5" aria-hidden />
    </Link>
  );
}
