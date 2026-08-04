import { nextInt } from './rng';
import type { Card, Rank, Rng, Suit } from './types';

/**
 * T032 — the shoe (FR-016).
 *
 * Cards are drawn from the *end* of the array so a draw is O(1) and never
 * reallocates. Callers that want to stack a shoe for a test therefore write it
 * in reverse — `tests/helpers/hands.ts` hides that behind `stackedShoe`.
 */

const RANKS: readonly Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUITS: readonly Suit[] = ['♠', '♥', '♦', '♣'];

/** An ordered shoe of `decks` full decks. Shuffle it before dealing. */
export function buildShoe(decks: number): Card[] {
  const shoe: Card[] = [];
  for (let deck = 0; deck < decks; deck++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        shoe.push({ rank, suit });
      }
    }
  }
  return shoe;
}

/**
 * Fisher–Yates, driven by the injected `Rng` (research.md R2).
 *
 * Shuffle quality is a property of the algorithm rather than of the generator,
 * which is what lets a deliberately weak seeded PRNG stay acceptable here.
 */
export function shuffle(cards: readonly Card[], rng: Rng): Card[] {
  const result = [...cards];
  for (let i = result.length - 1; i > 0; i--) {
    const j = nextInt(rng, i + 1);
    const a = result[i] as Card;
    const b = result[j] as Card;
    result[i] = b;
    result[j] = a;
  }
  return result;
}

export function createShoe(decks: number, rng: Rng): Card[] {
  return shuffle(buildShoe(decks), rng);
}

/**
 * Takes the next card. Total by contract: an exhausted shoe yields a null card
 * rather than throwing, so a miscounted deal degrades instead of crashing a
 * hand in progress.
 */
export function draw(shoe: readonly Card[]): { card: Card | null; shoe: readonly Card[] } {
  if (shoe.length === 0) return { card: null, shoe };
  return { card: shoe[shoe.length - 1] as Card, shoe: shoe.slice(0, -1) };
}

/**
 * FR-016: true once penetration is passed. Callers check this *between* rounds
 * only — the shoe never reshuffles mid-hand.
 */
export function needsReshuffle(
  shoe: readonly Card[],
  shoeSize: number,
  penetration: number,
): boolean {
  if (shoeSize <= 0) return true;
  return shoe.length <= Math.floor(shoeSize * (1 - penetration));
}
