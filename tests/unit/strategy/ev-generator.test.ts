import { describe, expect, it } from 'vitest';
import {
  buildDeck,
  dealerFinalProbabilities,
  DECK_KEYS,
  evStand,
  removeCard,
  solveDecisionPoint,
  type DeckKey,
} from '../../../scripts/ev-solver';
import { PHASE_1_RULES } from '../../../src/engine/rules-config';

/**
 * T062 — validating the generator against published figures (research.md R1).
 *
 * "The EV generator must be validated against published figures before its
 * output is trusted. Treat a mismatch as a generator bug, not a chart
 * disagreement." This is that validation, and it is the reason the solver lives
 * in an importable module rather than inside a CLI script.
 *
 * The oracle is dealer bust probability by upcard, which is the most widely
 * published and most independently verifiable number in the game. Upcards 2-9
 * are used because they are insensitive to the peek rule; an Ace or ten upcard
 * shifts depending on whether blackjack is resolved before the player acts, so
 * they are asserted separately and more loosely.
 */
const rules = PHASE_1_RULES;

/** Published dealer bust rates, six decks, dealer hits soft 17. */
const PUBLISHED_BUST_RATE: Record<string, number> = {
  '2': 0.3536,
  '3': 0.3739,
  '4': 0.3983,
  '5': 0.4232,
  '6': 0.4361,
  '7': 0.2599,
  '8': 0.2386,
  '9': 0.2323,
};

describe('dealer outcome model (research.md R1)', () => {
  it.each(Object.entries(PUBLISHED_BUST_RATE) as [DeckKey, number][])(
    'FR-020: matches the published bust rate for a dealer %s within one point',
    (upcard, published) => {
      const probs = dealerFinalProbabilities(upcard, buildDeck(rules.decks), rules);
      // One percentage point. The residual is the fixed-composition
      // approximation documented in ev-solver.ts — draws inside the dealer's
      // own recursion are not depleted — and it runs to about ±0.005.
      expect(Math.abs(probs.bust - published)).toBeLessThan(0.01);
    },
  );

  it('FR-020: conditions the Ace and ten columns on the dealer not holding a natural', () => {
    // Deliberately *not* compared against an unconditional published figure.
    // Under the peek rule a dealer natural ends the round before the player
    // decides, so those hands are excluded and the rest renormalised — which
    // raises the apparent bust rate well above the unconditional number. Using
    // the unconditional figure here would bias every cell in both columns.
    const deck = buildDeck(rules.decks);
    expect(dealerFinalProbabilities('A', deck, rules).bust).toBeGreaterThan(0.15);
    expect(dealerFinalProbabilities('10', deck, rules).bust).toBeGreaterThan(0.21);
  });

  it('FR-020: every upcard produces a complete probability distribution', () => {
    for (const upcard of DECK_KEYS) {
      const probs = dealerFinalProbabilities(upcard, buildDeck(rules.decks), rules);
      const total =
        probs.bust + probs[17] + probs[18] + probs[19] + probs[20] + probs[21];
      expect(total).toBeCloseTo(1, 6);
    }
  });

  it('FR-012: hitting soft 17 raises the dealer bust rate against a 6', () => {
    const deck = buildDeck(rules.decks);
    const h17 = dealerFinalProbabilities('6', deck, rules);
    const s17 = dealerFinalProbabilities('6', deck, { ...rules, dealerHitsSoft17: false });
    expect(h17.bust).toBeGreaterThan(s17.bust);
  });

  it('FR-020: a dealer Ace busts far less often than a dealer 6', () => {
    const deck = buildDeck(rules.decks);
    expect(dealerFinalProbabilities('A', deck, rules).bust).toBeLessThan(
      dealerFinalProbabilities('6', deck, rules).bust,
    );
  });
});

describe('standing expected values (research.md R1)', () => {
  it('FR-020: standing on 21 is worth far more than standing on 16', () => {
    const deck = buildDeck(rules.decks);
    const probs = dealerFinalProbabilities('10', deck, rules);
    expect(evStand(21, probs)).toBeGreaterThan(evStand(16, probs));
  });

  it('FR-020: standing on a hard 16 against a 10 loses roughly half a bet', () => {
    const probs = dealerFinalProbabilities('10', buildDeck(rules.decks), rules);
    expect(evStand(16, probs)).toBeGreaterThan(-0.62);
    expect(evStand(16, probs)).toBeLessThan(-0.48);
  });

  it('FR-020: standing on 20 against a 6 is strongly positive', () => {
    const probs = dealerFinalProbabilities('6', buildDeck(rules.decks), rules);
    expect(evStand(20, probs)).toBeGreaterThan(0.6);
  });

  it('FR-020: every standing EV lies within a single bet', () => {
    const probs = dealerFinalProbabilities('7', buildDeck(rules.decks), rules);
    for (let total = 12; total <= 21; total++) {
      expect(Math.abs(evStand(total, probs))).toBeLessThanOrEqual(1);
    }
  });
});

describe('deck accounting (FR-016, research.md R1)', () => {
  it('FR-016: a six-deck shoe holds 96 ten-valued cards and 24 Aces', () => {
    const deck = buildDeck(6);
    expect(deck['10']).toBe(96);
    expect(deck['A']).toBe(24);
  });

  it('FR-016: removing a card leaves the rest untouched', () => {
    const deck = buildDeck(6);
    const after = removeCard(deck, '10');
    expect(after['10']).toBe(95);
    expect(after['A']).toBe(24);
    expect(deck['10']).toBe(96); // the input is not mutated
  });
});

describe('solved decision points (FR-020)', () => {
  it('FR-022: produces an expected value for every action available at a decision point', () => {
    const solved = solveDecisionPoint('pair-8', '10', rules);
    expect(solved.hit).toBeDefined();
    expect(solved.stand).toBeDefined();
    expect(solved.double).toBeDefined();
    expect(solved.split).toBeDefined();
  });

  it('FR-022: offers no split value for a non-pair shape', () => {
    expect(solveDecisionPoint('hard-16', '10', rules).split).toBeUndefined();
  });

  it('SC-003: doubling a hard 11 against a 6 beats hitting it', () => {
    const solved = solveDecisionPoint('hard-11', '6', rules);
    expect(solved.double!).toBeGreaterThan(solved.hit!);
  });

  it('SC-003: hitting a hard 16 against a 10 beats standing on it', () => {
    const solved = solveDecisionPoint('hard-16', '10', rules);
    expect(solved.hit!).toBeGreaterThan(solved.stand!);
  });

  it('SC-003: standing on a hard 20 beats every alternative', () => {
    const solved = solveDecisionPoint('hard-20', '9', rules);
    expect(solved.stand!).toBeGreaterThan(solved.hit!);
    expect(solved.stand!).toBeGreaterThan(solved.double!);
  });

  it('FR-029: is deterministic — the same input always yields the same numbers', () => {
    expect(solveDecisionPoint('soft-18', '9', rules)).toEqual(
      solveDecisionPoint('soft-18', '9', rules),
    );
  });
});
