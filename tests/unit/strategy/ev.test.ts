import { describe, expect, it } from 'vitest';
import { rankActions, recommend } from '../../../src/strategy/ev';
import { legalActions } from '../../../src/engine/rules';
import { PHASE_1_RULES } from '../../../src/engine/rules-config';
import { hand, round } from '../../helpers/hands';
import { DEALER_UPCARDS } from '../../fixtures/basic-strategy';

/** T064 — FR-022: one entry per legal action, sorted, with recommend on top. */

const rules = PHASE_1_RULES;

const at = (player: string, dealer: string, bankroll = 1000) =>
  round({
    playerHands: [hand(player)],
    dealerHand: hand(`${dealer},7`, { id: 'dealer' }),
    availableBankroll: bankroll,
  });

describe('rankActions mirrors legalActions exactly (FR-002, FR-022)', () => {
  const shapes = ['10,6', 'A,7', '8,8', '5,6', '5,4,3', 'A,A', 'K,10'];

  it.each(shapes)('FR-022: %s is ranked over exactly its legal actions', (player) => {
    for (const dealer of DEALER_UPCARDS) {
      const state = at(player, dealer);
      const ranked = rankActions(state, rules).map((entry) => entry.action);
      expect([...ranked].sort()).toEqual([...legalActions(state, rules)].sort());
    }
  });

  it('FR-002: a bankroll that cannot cover a double drops it from the ranking', () => {
    const poor = at('5,6', '6', 0);
    expect(rankActions(poor, rules).map((r) => r.action)).not.toContain('double');
  });

  it('FR-022: descending order holds for every shape and upcard', () => {
    for (const player of shapes) {
      for (const dealer of DEALER_UPCARDS) {
        const evs = rankActions(at(player, dealer), rules).map((r) => r.ev);
        for (let i = 1; i < evs.length; i++) {
          expect(evs[i - 1]!).toBeGreaterThanOrEqual(evs[i]!);
        }
      }
    }
  });

  it('FR-021: recommend is always the head of the ranking', () => {
    for (const player of shapes) {
      for (const dealer of DEALER_UPCARDS) {
        const state = at(player, dealer);
        expect(recommend(state, rules)).toBe(rankActions(state, rules)[0]!.action);
      }
    }
  });
});

describe('expected values behave like expected values', () => {
  it('doubling is worth roughly twice the equivalent single bet', () => {
    const ranked = rankActions(at('5,6', '6'), rules);
    const double = ranked.find((r) => r.action === 'double')!;
    const hit = ranked.find((r) => r.action === 'hit')!;
    expect(double.ev).toBeGreaterThan(hit.ev);
    expect(double.ev).toBeLessThan(hit.ev * 2 + 0.5);
  });

  it('standing on 20 is positive against every upcard', () => {
    for (const dealer of DEALER_UPCARDS) {
      const stand = rankActions(at('10,10', dealer), rules).find((r) => r.action === 'stand')!;
      expect(stand.ev).toBeGreaterThan(0);
    }
  });

  it('a hard 16 is negative against every upcard — there is no good option', () => {
    for (const dealer of DEALER_UPCARDS) {
      for (const entry of rankActions(at('10,6', dealer), rules)) {
        expect(entry.ev).toBeLessThan(0);
      }
    }
  });

  it('the same decision point always returns identical numbers (FR-029)', () => {
    expect(rankActions(at('10,6', '10'), rules)).toEqual(rankActions(at('10,6', '10'), rules));
  });

  it('a resolved hand offers no ranking at all', () => {
    const settled = round({ playerHands: [hand('10,6', { status: 'busted' })] });
    expect(rankActions(settled, rules)).toEqual([]);
  });
});
