import type { Card, Hand, Rank } from './types';

/**
 * T031 — hand evaluation (FR-001).
 *
 * Card values are derived here and stored nowhere. An Ace has no fixed value,
 * so carrying one on the card would make the soft/hard distinction ambiguous —
 * which is the bug FR-001 exists to prevent.
 */

/** The high value of a rank. Aces report 11; `handTotal` demotes them as needed. */
export function cardValue(rank: Rank): number {
  if (rank === 'A') return 11;
  if (rank === 'J' || rank === 'Q' || rank === 'K') return 10;
  return Number(rank);
}

/**
 * FR-001: Aces count 11 unless that exceeds 21, in which case they count 1.
 *
 * `isSoft` is true when an Ace is still being counted as 11 — which is what
 * makes a hand unbustable on the next card, and what the strategy chart's
 * separate soft rows are keyed on.
 */
export function handTotal(cards: readonly Card[]): { total: number; isSoft: boolean } {
  let total = 0;
  let aces = 0;

  for (const card of cards) {
    total += cardValue(card.rank);
    if (card.rank === 'A') aces += 1;
  }

  // Demote one Ace at a time — 11 becomes 1 — until the hand fits under 21.
  let softAces = aces;
  while (total > 21 && softAces > 0) {
    total -= 10;
    softAces -= 1;
  }

  return { total, isSoft: softAces > 0 };
}

export function isBust(cards: readonly Card[]): boolean {
  return handTotal(cards).total > 21;
}

/**
 * FR-011: a natural is exactly two cards totalling 21 on an unsplit hand.
 *
 * A ten on a split Ace is 21 but is not a natural, and does not pay 3:2. That
 * single exception is why this takes a `Hand` rather than a card array.
 */
export function isNatural(hand: Hand): boolean {
  if (hand.isSplitChild) return false;
  if (hand.cards.length !== 2) return false;
  return handTotal(hand.cards).total === 21;
}

/** True when the two cards form a splittable pair — by value, so K,10 counts. */
export function isPair(cards: readonly Card[]): boolean {
  if (cards.length !== 2) return false;
  const [first, second] = cards;
  if (!first || !second) return false;
  return cardValue(first.rank) === cardValue(second.rank);
}
