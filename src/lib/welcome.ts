import "server-only";
import { db } from "@/lib/db";
import { EARLY_BIRD_ACCOUNTS, EARLY_BIRD_CREDITS } from "@/lib/money";

/** How many of the early-bird welcome credit spots are still open. */
export async function welcomeSpotsLeft() {
  return Math.max(0, EARLY_BIRD_ACCOUNTS - (await db.user.count({ where: { welcomeBonusPaid: true } })));
}

/**
 * Pays the welcome credits once per account, right after signup, while early-bird spots are left.
 * (Accounts made before this, still waiting on their first game, get it on their next dashboard visit.)
 * The flag flips in the same update that adds the credits, so a double submit can't pay twice.
 * Old accounts were created with the flag already true, so they're never paid again.
 */
export async function payWelcomeBonus(userId: string) {
  if (EARLY_BIRD_CREDITS <= 0) return false;
  return db.$transaction(async (tx) => {
    if ((await tx.user.count({ where: { welcomeBonusPaid: true } })) >= EARLY_BIRD_ACCOUNTS) return false;
    const r = await tx.user.updateMany({
      where: { id: userId, welcomeBonusPaid: false },
      data: { welcomeBonusPaid: true, credits: { increment: EARLY_BIRD_CREDITS } },
    });
    return r.count === 1;
  });
}

