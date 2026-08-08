import { describe, expect, it } from 'vitest';
import { recommend, rankActions } from '../../../src/strategy/ev';
import { shapeOf } from '../../../src/strategy/shape';
import { PHASE_1_RULES } from '../../../src/engine/rules-config';
import { DEALER_UPCARDS, REFERENCE_CHART } from '../../fixtures/basic-strategy';
import { cards, cardsForShape, hand, round } from '../../helpers/hands';
import type { Action, Rank } from '../../../src/engine/types';

/**
 * T063 — FR-021, SC-003: the recommendation matches the published chart at
 * **every** charted decision point, not a sample.
 *
 * This is the test the whole strategy module exists to pass, and the one Alex
 * came to check. It is table-driven over `REFERENCE_CHART` so a new cell in the
 * fixture automatically becomes a new assertion.
 */
const rules = PHASE_1_RULES;

function stateFor(shape: string, dealerUpcard: Rank, bankroll = 1000) {
  return round({
    playerHands: [hand(cardsForShape(shape))],
    dealerHand: hand(`${dealerUpcard},7`, { id: 'dealer' }),
    availableBankroll: bankroll,
  });
}

describe('shapeOf (FR-021)', () => {
  it.each([
    ['10,6', 'hard-16'],
    ['A,7', 'soft-18'],
    ['8,8', 'pair-8'],
    ['A,A', 'pair-A'],
    ['K,10', 'pair-10'],
    ['A,6,10', 'hard-17'],
    ['5,4,3', 'hard-12'],
    ['A,2,4', 'soft-17'],
  ])('classifies %s as %s', (shorthand, shape) => {
    expect(shapeOf(cards(shorthand))).toBe(shape);
  });

  it('FR-021: only calls two identical-value cards a pair', () => {
    expect(shapeOf(cards('8,8,5'))).toBe('hard-21');
  });
});

/**
 * Two fixture rows exist only as fallbacks and cannot be reached as a shape in
 * their own right, so they are not asserted against a constructed hand:
 *
 *   hard-4  — only two 2s make it, which classifies as `pair-2`.
 *   soft-12 — only two Aces make it, which classifies as `pair-A`.
 *
 * Both are still exercised, as the `withoutSplit` fallback of their pair rows.
 */
const isReachableShape = (entry: { kind: string; value: number | string }) =>
  !(entry.kind === 'hard' && entry.value === 4) && !(entry.kind === 'soft' && entry.value === 12);

describe('recommend matches the reference chart (FR-021, SC-003)', () => {
  const chartable = REFERENCE_CHART.filter(isReachableShape);

  it('SC-003: covers every charted decision point', () => {
    // 18 hard rows + 10 soft rows + 10 pair rows, each across 10 upcards.
    expect(REFERENCE_CHART).toHaveLength(38 * DEALER_UPCARDS.length);
  });

  it.each(chartable.map((e) => [e.shape, e.dealerUpcard, e.action] as const))(
    'FR-021: %s vs %s recommends %s',
    (shape, dealerUpcard, expected) => {
      expect(recommend(stateFor(shape, dealerUpcard), rules)).toBe(expected);
    },
  );
});

describe('recommendation degrades with the legal action set (FR-002, FR-021)', () => {
  const doubleable = REFERENCE_CHART.filter(
    (entry) => entry.action === 'double' && entry.kind !== 'pair' && isReachableShape(entry),
  );

  it.each(doubleable.map((e) => [e.shape, e.dealerUpcard, e.withoutDouble] as const))(
    'FR-021: %s vs %s falls back to %s when doubling is unaffordable',
    (shape, dealerUpcard, fallback) => {
      // A bankroll below the bet removes Double from the legal set entirely.
      const state = stateFor(shape, dealerUpcard, 0);
      expect(recommend(state, rules)).toBe(fallback);
    },
  );

  const splittable = REFERENCE_CHART.filter((entry) => entry.action === 'split');

  it.each(splittable.map((e) => [e.shape, e.dealerUpcard, e.withoutSplit] as const))(
    'FR-010: %s vs %s falls back to %s at the four-hand cap',
    (shape, dealerUpcard, fallback) => {
      const capped = round({
        playerHands: [
          hand(cardsForShape(shape), { id: 'h1' }),
          hand('10,6', { id: 'h2' }),
          hand('10,6', { id: 'h3' }),
          hand('10,6', { id: 'h4' }),
        ],
        dealerHand: hand(`${dealerUpcard},7`, { id: 'dealer' }),
      });
      expect(recommend(capped, rules)).toBe(fallback);
    },
  );
});

describe('rankActions (FR-022, NFR-002)', () => {
  it('FR-022: returns one entry per legal action', () => {
    const state = stateFor('pair-8', '10');
    const ranked = rankActions(state, rules);
    expect(ranked.map((r) => r.action).sort()).toEqual(['double', 'hit', 'split', 'stand']);
  });

  it('FR-022: is sorted by expected value, descending', () => {
    const ranked = rankActions(stateFor('hard-16', '10'), rules);
    const evs = ranked.map((r) => r.ev);
    expect([...evs].sort((a, b) => b - a)).toEqual(evs);
  });

  it('FR-021: recommend equals the top-ranked action', () => {
    for (const shape of ['hard-16', 'soft-18', 'pair-8', 'hard-11']) {
      for (const upcard of DEALER_UPCARDS) {
        const state = stateFor(shape, upcard);
        expect(recommend(state, rules)).toBe(rankActions(state, rules)[0]!.action);
      }
    }
  });

  it('FR-022: every expected value lies within the range a bet can move', () => {
    for (const upcard of DEALER_UPCARDS) {
      for (const { ev } of rankActions(stateFor('hard-11', upcard), rules)) {
        expect(ev).toBeGreaterThanOrEqual(-2);
        expect(ev).toBeLessThanOrEqual(2);
      }
    }
  });

  it('FR-022: returns nothing when there is no decision to make', () => {
    expect(rankActions(round({ phase: 'settled' }), rules)).toEqual([]);
  });

  it('NFR-002: resolves by lookup — a full chart sweep costs no measurable time', () => {
    const points = REFERENCE_CHART.filter(isReachableShape).map((entry) =>
      stateFor(entry.shape, entry.dealerUpcard),
    );

    const started = performance.now();
    for (const state of points) rankActions(state, rules);
    // 380 decision points. A runtime solver could not do this inside 100ms.
    expect(performance.now() - started).toBeLessThan(100);
  });

  it('NFR-002: is synchronous — no promise reaches the caller', () => {
    const result: unknown = rankActions(stateFor('hard-16', '10'), rules);
    expect(result).not.toBeInstanceOf(Promise);
  });
});

describe('the chart and the companion cannot disagree (FR-051c)', () => {
  it('FR-051c: every chart cell resolves through the same lookup the companion uses', () => {
    const disagreements: string[] = [];
    for (const entry of REFERENCE_CHART.filter(isReachableShape)) {
      const actual = recommend(stateFor(entry.shape, entry.dealerUpcard), rules) as Action;
      if (actual !== entry.action) {
        disagreements.push(`${entry.shape} vs ${entry.dealerUpcard}: ${actual} != ${entry.action}`);
      }
    }
    expect(disagreements).toEqual([]);
  });
});
