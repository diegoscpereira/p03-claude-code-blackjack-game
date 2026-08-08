import { ALL_UNLOCKS, isUnlockId, levelForXp } from '../progression/levels';
import type { UnlockId } from '../progression/levels';
import type { ProgressSnapshot } from './records';

/**
 * Reconciliation — spec boundary rule 4.
 *
 * > *Monotonic counters take the higher value; hand logs are append-only and
 * > never overwritten; the current bankroll takes the local value, since local
 * > play is authoritative.*
 *
 * The asymmetry between counters and bankroll is the whole design, and it is
 * easy to get wrong by treating "merge" as one operation. Counters are lifetime
 * totals that only grow, so taking the maximum can never lose information.
 * Bankroll is a *current* value that moves both ways — taking the maximum there
 * would hand a player free chips every time they reconnected after a losing run.
 *
 * The same rule runs on the server in `api/progress.ts`, so a reconnect and a
 * retry converge on the same row. That is not duplication for its own sake: the
 * client needs it to reconcile a slow session-start read, and the server needs
 * it to make writes idempotent (R4).
 */

const higher = (a: number, b: number): number => Math.max(a, b);

/** Union of two unlock sets, in ladder order, discarding unknown names. */
function mergeUnlocks(
  local: readonly UnlockId[],
  remote: readonly UnlockId[],
): readonly UnlockId[] {
  const held = new Set([...local, ...remote].filter(isUnlockId));
  // Ordering by the ladder rather than by arrival keeps the merged value stable,
  // which is what lets an idempotent write actually compare equal on a retry.
  return ALL_UNLOCKS.filter((unlock) => held.has(unlock));
}

/**
 * Merges a remote replica into local state. `null` means the player has no
 * stored row yet (a 404 from `GET /api/progress`), which is not an error —
 * FR-066 makes it the normal first-visit path.
 */
export function reconcile(
  local: ProgressSnapshot,
  remote: ProgressSnapshot | null,
): ProgressSnapshot {
  if (remote === null) return local;

  const xp = higher(local.xp, remote.xp);

  return {
    xp,
    // FR-051d: recomputed, never merged. Taking the higher of two *levels*
    // could produce a level that disagrees with the reconciled XP — a state
    // that simply should not be representable.
    level: levelForXp(xp),
    handsPlayed: higher(local.handsPlayed, remote.handsPlayed),
    wins: higher(local.wins, remote.wins),
    losses: higher(local.losses, remote.losses),
    pushes: higher(local.pushes, remote.pushes),
    decisionsTaken: higher(local.decisionsTaken, remote.decisionsTaken),
    decisionsMatched: higher(local.decisionsMatched, remote.decisionsMatched),
    bankrollResets: higher(local.bankrollResets, remote.bankrollResets),
    unlocks: mergeUnlocks(local.unlocks, remote.unlocks),

    // Boundary rule 4: local play is authoritative for the live figures.
    bankroll: local.bankroll,
    netBankrollChange: local.netBankrollChange,
  };
}
