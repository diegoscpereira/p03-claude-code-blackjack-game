/**
 * T068 — the exact expected-value solver (research.md R1).
 *
 * Runs at build time, never at runtime. The output is a keyed table that
 * `src/strategy` reads with a hash lookup, which is what makes NFR-002's 100ms
 * budget trivially met and FR-029's determinism a fact rather than a claim.
 *
 * ## The model
 *
 * Expected values are *total-dependent* and computed against a fresh six-deck
 * composition with the three known cards removed — the player's two and the
 * dealer's upcard (spec Assumption 7: a fresh-shoe composition, not a running
 * count, since counting is out of scope).
 *
 * Draws within a recursion are taken against that fixed composition rather than
 * depleting it further. For a 312-card shoe the difference is in the fourth
 * decimal place, far below anything that reorders two actions, and it keeps the
 * recursion tractable without memoising on a mutable deck.
 *
 * The dealer is modelled **with a peek**: when the upcard is an Ace or a ten,
 * hole cards that would make a natural are excluded and the remainder
 * renormalised, because such a round ends before the player ever decides. This
 * is how published charts are computed, and getting it wrong shifts every cell
 * in those two columns.
 *
 * ## Reading a disagreement
 *
 * If this solver and the published chart disagree, research.md R1 is explicit:
 * **it is a bug here**, not a chart disagreement. Fix the solver; never edit a
 * cell of the fixture to match.
 */
import type { HouseRules } from '../src/engine/types';

/** Rank keys, collapsed to the ten distinct *values* a rank can carry. */
export type DeckKey = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10';

export type Deck = Record<DeckKey, number>;

export const DECK_KEYS: DeckKey[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10'];

/** Six decks: 24 of each rank, and 96 ten-valued cards (10, J, Q, K). */
export function buildDeck(decks: number): Deck {
  const deck = {} as Deck;
  for (const key of DECK_KEYS) {
    deck[key] = key === '10' ? decks * 16 : decks * 4;
  }
  return deck;
}

export function removeCard(deck: Deck, key: DeckKey): Deck {
  return { ...deck, [key]: Math.max(0, deck[key] - 1) };
}

function deckTotal(deck: Deck): number {
  return DECK_KEYS.reduce((sum, key) => sum + deck[key], 0);
}

/** A memo key for a composition. Cards are removed as they are drawn, so the
 *  same total can be reached with different remaining decks. */
function deckSignature(deck: Deck): string {
  return DECK_KEYS.map((key) => deck[key]).join(',');
}

/** Probability of drawing each key from a composition. */
function drawProbabilities(deck: Deck): [DeckKey, number][] {
  const total = deckTotal(deck);
  if (total === 0) return [];
  return DECK_KEYS.filter((key) => deck[key] > 0).map((key) => [key, deck[key] / total]);
}

export function valueOf(key: DeckKey): number {
  if (key === 'A') return 11;
  return Number(key);
}

/**
 * Adds a card to a running total, tracking whether an Ace is still counted 11.
 *
 * The subtle case is drawing an Ace onto a hand that is *already* soft: A,3
 * plus an Ace is 25, demotes to 15, and is **still soft**, because the first
 * Ace is still worth 11. Marking it hard there makes hitting look worse than it
 * is, which is enough to move the soft-double boundary a whole row — exactly
 * the disagreement with the published chart that caught this.
 *
 * At most one Ace can ever count 11 (two would be 22), so `soft` remains a
 * boolean; only the transition needs the count.
 */
function addCard(total: number, soft: boolean, key: DeckKey): { total: number; soft: boolean } {
  let acesAt11 = (soft ? 1 : 0) + (key === 'A' ? 1 : 0);
  let next = total + valueOf(key);

  while (next > 21 && acesAt11 > 0) {
    next -= 10;
    acesAt11 -= 1;
  }

  return { total: next, soft: acesAt11 > 0 };
}

// ---------------------------------------------------------------------------
// Dealer
// ---------------------------------------------------------------------------

export interface DealerProbabilities {
  17: number;
  18: number;
  19: number;
  20: number;
  21: number;
  bust: number;
}

const EMPTY_PROBS = (): DealerProbabilities => ({ 17: 0, 18: 0, 19: 0, 20: 0, 21: 0, bust: 0 });

function scale(probs: DealerProbabilities, factor: number): DealerProbabilities {
  const out = EMPTY_PROBS();
  for (const key of Object.keys(out) as (keyof DealerProbabilities)[]) {
    out[key] = probs[key] * factor;
  }
  return out;
}

function accumulate(into: DealerProbabilities, from: DealerProbabilities): void {
  for (const key of Object.keys(into) as (keyof DealerProbabilities)[]) {
    into[key] += from[key];
  }
}

/** Recursively plays the dealer out from a partial total. */
function dealerFrom(
  total: number,
  soft: boolean,
  deck: Deck,
  rules: HouseRules,
  memo: Map<string, DealerProbabilities>,
): DealerProbabilities {
  if (total > 21) return { ...EMPTY_PROBS(), bust: 1 };

  const standing = total > 17 || (total === 17 && !(soft && rules.dealerHitsSoft17));
  if (standing) {
    const out = EMPTY_PROBS();
    out[total as 17 | 18 | 19 | 20 | 21] = 1;
    return out;
  }

  const key = `${total}|${soft}|${deckSignature(deck)}`;
  const cached = memo.get(key);
  if (cached) return cached;

  const out = EMPTY_PROBS();
  for (const [card, probability] of drawProbabilities(deck)) {
    const next = addCard(total, soft, card);
    // Exact card removal: the card just drawn is gone for every draw beneath
    // this one. Keeping the composition fixed instead biases low upcards
    // upward, because the dealer keeps redrawing the same small cards.
    const remaining = removeCard(deck, card);
    accumulate(out, scale(dealerFrom(next.total, next.soft, remaining, rules, memo), probability));
  }

  memo.set(key, out);
  return out;
}

/**
 * The dealer's final-total distribution given an upcard, **conditioned on the
 * dealer not holding a natural** (the peek rule). A round in which the dealer
 * has blackjack never reaches a player decision, so including it would bias
 * every expected value in the Ace and ten columns.
 */
export function dealerFinalProbabilities(
  upcard: DeckKey,
  deck: Deck,
  rules: HouseRules,
): DealerProbabilities {
  const afterUpcard = removeCard(deck, upcard);
  const memo = new Map<string, DealerProbabilities>();

  const naturalMaker: DeckKey | null = upcard === 'A' ? '10' : upcard === '10' ? 'A' : null;

  const candidates = drawProbabilities(afterUpcard).filter(([card]) => card !== naturalMaker);
  const remaining = candidates.reduce((sum, [, probability]) => sum + probability, 0);
  if (remaining === 0) return EMPTY_PROBS();

  const out = EMPTY_PROBS();
  for (const [card, probability] of candidates) {
    const start = addCard(valueOf(upcard), upcard === 'A', card);
    const played = dealerFrom(
      start.total,
      start.soft,
      removeCard(afterUpcard, card),
      rules,
      memo,
    );
    accumulate(out, scale(played, probability / remaining));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------

/** FR-013 settlement, expressed as an expected value for standing on `total`. */
export function evStand(total: number, dealer: DealerProbabilities): number {
  if (total > 21) return -1;

  let win = dealer.bust;
  let push = 0;
  for (const final of [17, 18, 19, 20, 21] as const) {
    if (total > final) win += dealer[final];
    else if (total === final) push += dealer[final];
  }
  const loss = 1 - win - push;
  return win - loss;
}

/** Playing on optimally after taking a card: the better of hitting again or standing. */
function evHit(
  total: number,
  soft: boolean,
  deck: Deck,
  dealer: DealerProbabilities,
  memo: Map<string, number>,
): number {
  const key = `${total}|${soft}|${deckSignature(deck)}`;
  const cached = memo.get(key);
  if (cached !== undefined) return cached;

  let value = 0;
  for (const [card, probability] of drawProbabilities(deck)) {
    const next = addCard(total, soft, card);
    if (next.total > 21) {
      value += probability * -1;
    } else {
      const standValue = evStand(next.total, dealer);
      const hitValue = evHit(next.total, next.soft, removeCard(deck, card), dealer, memo);
      value += probability * Math.max(standValue, hitValue);
    }
  }

  memo.set(key, value);
  return value;
}

/** FR-008: exactly one card, at twice the stake. */
function evDouble(total: number, soft: boolean, deck: Deck, dealer: DealerProbabilities): number {
  let value = 0;
  for (const [card, probability] of drawProbabilities(deck)) {
    const next = addCard(total, soft, card);
    value += probability * 2 * evStand(next.total, dealer);
  }
  return value;
}

/**
 * FR-009: the value of splitting, as two independent hands each starting from
 * one of the pair cards plus one draw.
 *
 * Resplitting is not modelled. It adds value to exactly the hands that are
 * already clear splits (Aces and 8s), so omitting it understates those cells
 * without changing which action wins — and modelling it exactly would require
 * tracking hand count through the recursion for no decision-relevant gain.
 */
function evSplit(pair: DeckKey, deck: Deck, dealer: DealerProbabilities, rules: HouseRules): number {
  const memo = new Map<string, number>();
  let perHand = 0;

  for (const [card, probability] of drawProbabilities(deck)) {
    const start = addCard(valueOf(pair), pair === 'A', card);

    // FR-011: a split Ace takes one card and stands — no hitting, no doubling.
    if (pair === 'A') {
      perHand += probability * evStand(start.total, dealer);
      continue;
    }

    const options = [evStand(start.total, dealer), evHit(start.total, start.soft, deck, dealer, memo)];
    if (rules.doubleAfterSplit) {
      options.push(evDouble(start.total, start.soft, deck, dealer));
    }
    perHand += probability * Math.max(...options);
  }

  return perHand * 2;
}

// ---------------------------------------------------------------------------
// Decision points
// ---------------------------------------------------------------------------

export interface SolvedPoint {
  hit?: number;
  stand?: number;
  double?: number;
  split?: number;
}

/** The two cards that produce a chart shape, for removing them from the deck. */
export function cardsForShape(shape: string): DeckKey[] {
  const [kind, value] = shape.split('-') as [string, string];
  if (kind === 'pair') return [value as DeckKey, value as DeckKey];
  if (kind === 'soft') return ['A', String(Number(value) - 11) as DeckKey];

  const total = Number(value);
  for (let first = 2; first <= 10; first++) {
    const second = total - first;
    if (second >= 2 && second <= 10 && second !== first) {
      return [String(first) as DeckKey, String(second) as DeckKey];
    }
  }
  // 4, 6, 8 and 20 have no unequal two-card decomposition; the pair is the only
  // composition, and the hard row is reached from three or more cards anyway.
  return [String(total / 2) as DeckKey, String(total / 2) as DeckKey];
}

function shapeTotals(shape: string): { total: number; soft: boolean } {
  const [kind, value] = shape.split('-') as [string, string];
  if (kind === 'soft') return { total: Number(value), soft: true };
  if (kind === 'hard') return { total: Number(value), soft: false };
  if (value === 'A') return { total: 12, soft: true };
  return { total: valueOf(value as DeckKey) * 2, soft: false };
}

export function solveDecisionPoint(
  shape: string,
  upcard: DeckKey,
  rules: HouseRules,
): SolvedPoint {
  // Remove the three cards already on the table before computing anything.
  let deck = buildDeck(rules.decks);
  for (const card of cardsForShape(shape)) deck = removeCard(deck, card);
  deck = removeCard(deck, upcard);

  const dealer = dealerFinalProbabilities(upcard, deck, rules);
  const { total, soft } = shapeTotals(shape);

  const solved: SolvedPoint = {
    stand: evStand(total, dealer),
    hit: evHit(total, soft, deck, dealer, new Map()),
    double: evDouble(total, soft, deck, dealer),
  };

  if (shape.startsWith('pair-')) {
    solved.split = evSplit(shape.slice(5) as DeckKey, deck, dealer, rules);
  }

  return solved;
}

/** Every shape the chart covers: hard 5-21, soft 12-21, and the ten pairs. */
export function allShapes(): string[] {
  const shapes: string[] = [];
  for (let total = 4; total <= 21; total++) shapes.push(`hard-${total}`);
  for (let total = 12; total <= 21; total++) shapes.push(`soft-${total}`);
  for (const key of DECK_KEYS) shapes.push(`pair-${key}`);
  return shapes;
}
