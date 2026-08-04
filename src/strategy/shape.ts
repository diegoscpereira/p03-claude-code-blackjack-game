import { handTotal, isPair } from '../engine/hand';
import type { Card } from '../engine/types';

/**
 * The key a hand looks up under: `hard-16`, `soft-18`, `pair-8`.
 *
 * This is the one place the chart's three-row-family structure is defined, and
 * both the companion and the unlockable guides resolve through it — which is
 * what makes FR-051c ("an unlocked chart and a live recommendation can never
 * disagree") true by construction rather than by discipline.
 */
export function shapeOf(cards: readonly Card[]): string {
  if (isPair(cards)) {
    const rank = cards[0]!.rank;
    // Ten-valued ranks share one row: K,10 is the same decision as 10,10.
    const key = rank === 'J' || rank === 'Q' || rank === 'K' ? '10' : rank;
    return `pair-${key}`;
  }

  const { total, isSoft } = handTotal(cards);
  return `${isSoft ? 'soft' : 'hard'}-${total}`;
}

/** The dealer's upcard, collapsed to the ten values the chart has columns for. */
export function upcardKey(rank: Card['rank']): string {
  if (rank === 'J' || rank === 'Q' || rank === 'K') return '10';
  return rank;
}
