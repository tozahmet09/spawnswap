"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, Gift } from "lucide-react";

// Pages that already say it in big type (or are the form itself).
const QUIET = ["/dashboard", "/dashboard/games/new", "/signup", "/login"];

/**
 * Thin line under the nav for signed-in users who have credits but haven't added a game yet.
 * Many people sign up and never add their game, so their welcome credits never bring anyone.
 */
export function WelcomeBar({ credits }: { credits: number }) {
  const path = usePathname();
  if (QUIET.includes(path)) return null;
  return (
    <Link
      href="/dashboard/games/new"
      className="group flex items-center justify-center gap-2 border-t border-lime/25 bg-lime/[.08] px-4 py-2 text-[13px] text-cream transition hover:bg-lime/[.14]"
    >
      <Gift className="h-3.5 w-3.5 shrink-0 text-lime" aria-hidden />
      <span>
        Your <b className="font-semibold text-lime">{credits === 1 ? "1 credit" : `${credits} credits`}</b> {credits === 1 ? "is" : "are"} ready.
        {" "}Add your game<span className="hidden sm:inline"> to bring players to it</span>
      </span>
      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-lime transition group-hover:translate-x-0.5" aria-hidden />
    </Link>
  );
}
