import "server-only";
import { db } from "@/lib/db";
import { EARLY_BIRD_ACCOUNTS, EARLY_BIRD_CREDITS } from "@/lib/money";

/** How many of the early-bird welcome credit spots are still open. */
export async function welcomeSpotsLeft() {
  return Math.max(0, EARLY_BIRD_ACCOUNTS - (await db.user.count({ where: { welcomeBonusPaid: true } })));
}

/**
 * Pays the welcome credits once per account, on the first game, while early-bird spots are left.
 * The flag flips in the same update that adds the credits, so a double submit can't pay twice,
 * and deleting the game and adding it again doesn't pay again.
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

/** True when this account would still get the welcome credits for adding its first game. */
export async function welcomeOpenFor(user: { welcomeBonusPaid: boolean } | null | undefined) {
  if (!user || user.welcomeBonusPaid || EARLY_BIRD_CREDITS <= 0) return false;
  return (await welcomeSpotsLeft()) > 0;
}
