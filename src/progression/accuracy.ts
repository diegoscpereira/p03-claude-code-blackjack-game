/**
 * FR-024a, FR-024b — the EV accuracy score, derived and never stored.
 *
 * data-model.md is explicit that this is not a column: a stored score can
 * disagree with its own inputs after a partial sync, and the two counters
 * reconcile independently (boundary rule 4). Recomputing it on every read makes
 * that disagreement impossible to represent.
 */

/**
 * The lifetime match rate as a percentage, or `null` when the player has taken
 * no decisions — FR-024b requires "unavailable", which is a different claim
 * from "0%" and must not be collapsed into one.
 */
export function evAccuracy(taken: number, matched: number): number | null {
  if (!Number.isFinite(taken) || !Number.isFinite(matched)) return null;
  if (taken <= 0 || matched < 0) return null;
  // Counters reconcile independently, so a partial sync can briefly leave
  // `matched` ahead of `taken`. Clamping keeps the display sane without
  // touching either counter.
  return Math.min(100, (matched / taken) * 100);
}

/** The score as the interface shows it. An em dash reads as "not yet known". */
export function formatEvAccuracy(taken: number, matched: number): string {
  const score = evAccuracy(taken, matched);
  return score === null ? '—' : `${score.toFixed(1)}%`;
}
