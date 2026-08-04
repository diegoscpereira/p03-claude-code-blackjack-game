import { describe, expect, it } from 'vitest';
import { legalActions } from '../../../src/engine/rules';
import { applyAction } from '../../../src/engine/round';
import { PHASE_1_RULES } from '../../../src/engine/rules-config';
import { hand, round } from '../../helpers/hands';
import type { Phase } from '../../../src/engine/types';

/**
 * T023 — FR-002, FR-010: the legal action set.
 * T028 — FR-015: an illegal action returns the state unchanged.
 *
 * contracts/engine-api.md makes this the authority: "the UI renders exactly
 * this set and nothing else. If an action is absent here, no path in the UI may
 * offer it." Every gap in this test is a control that could lie to a player.
 */
const rules = PHASE_1_RULES;

describe('legalActions — basics (FR-002)', () => {
  it('FR-002: a fresh two-card hand may hit, stand, or double', () => {
    const state = round({ playerHands: [hand('10,6')] });
    expect(legalActions(state, rules).sort()).toEqual(['double', 'hit', 'stand']);
  });

  it('FR-002: a three-card hand may no longer double', () => {
    const state = round({ playerHands: [hand('5,4,3')] });
    expect(legalActions(state, rules).sort()).toEqual(['hit', 'stand']);
  });

  it('FR-002: surrender is never offered in Phase 1', () => {
    const state = round({ playerHands: [hand('10,6')] });
    expect(legalActions(state, rules)).not.toContain('surrender');
  });
});

describe('legalActions — phase and hand status (FR-002)', () => {
  it.each<Phase>(['betting', 'dealing', 'bots', 'dealer', 'settled'])(
    'FR-002: offers nothing during the %s phase',
    (phase) => {
      expect(legalActions(round({ phase }), rules)).toEqual([]);
    },
  );

  it.each(['stood', 'busted', 'blackjack', 'settled'] as const)(
    'FR-002: a %s hand is resolved and offers nothing',
    (status) => {
      const state = round({ playerHands: [hand('10,6', { status })] });
      expect(legalActions(state, rules)).toEqual([]);
    },
  );

  it('FR-002: a doubled hand is resolved and offers nothing', () => {
    const state = round({ playerHands: [hand('5,6,10', { doubled: true, status: 'stood' })] });
    expect(legalActions(state, rules)).toEqual([]);
  });

  it('FR-002: an out-of-range active hand index offers nothing rather than throwing', () => {
    const state = round({ playerHands: [hand('10,6')], activeHandIndex: 7 });
    expect(legalActions(state, rules)).toEqual([]);
  });
});

describe('legalActions — double (FR-002, spec Edge Cases)', () => {
  it('FR-002: double is not offered when the bankroll cannot cover it', () => {
    const state = round({ playerHands: [hand('5,6', { bet: 100 })], availableBankroll: 99 });
    expect(legalActions(state, rules)).not.toContain('double');
  });

  it('FR-002: double is offered when the bankroll covers it exactly', () => {
    const state = round({ playerHands: [hand('5,6', { bet: 100 })], availableBankroll: 100 });
    expect(legalActions(state, rules)).toContain('double');
  });

  it('FR-002: double after split is offered under these house rules', () => {
    const state = round({
      playerHands: [hand('8,3', { isSplitChild: true }), hand('8,5', { isSplitChild: true })],
    });
    expect(legalActions(state, rules)).toContain('double');
  });

  it('FR-002: double after split is withheld when the rules forbid it', () => {
    const state = round({ playerHands: [hand('8,3', { isSplitChild: true })] });
    expect(legalActions(state, { ...rules, doubleAfterSplit: false })).not.toContain('double');
  });
});

describe('legalActions — split (FR-009, FR-010)', () => {
  it('FR-009: a pair may be split', () => {
    expect(legalActions(round({ playerHands: [hand('8,8')] }), rules)).toContain('split');
  });

  it('FR-009: two different ten-value cards count as a pair', () => {
    expect(legalActions(round({ playerHands: [hand('K,10')] }), rules)).toContain('split');
  });

  it('FR-009: a non-pair may not be split', () => {
    expect(legalActions(round({ playerHands: [hand('10,6')] }), rules)).not.toContain('split');
  });

  it('FR-010: split is not offered at the four-hand cap', () => {
    const four = [hand('8,8', { id: 'h1' }), hand('8,8', { id: 'h2' }), hand('8,8', { id: 'h3' }), hand('8,8', { id: 'h4' })];
    expect(legalActions(round({ playerHands: four }), rules)).not.toContain('split');
  });

  it('FR-010: split is still offered at three hands', () => {
    const three = [hand('8,8', { id: 'h1' }), hand('8,8', { id: 'h2' }), hand('8,8', { id: 'h3' })];
    expect(legalActions(round({ playerHands: three }), rules)).toContain('split');
  });

  it('FR-009: split is not offered when the bankroll cannot cover the second bet', () => {
    const state = round({ playerHands: [hand('8,8', { bet: 100 })], availableBankroll: 99 });
    expect(legalActions(state, rules)).not.toContain('split');
  });
});

describe('legalActions — split Aces (FR-011)', () => {
  it('FR-011: a split-Ace hand offers nothing, because it stands automatically', () => {
    const state = round({
      playerHands: [hand('A,9', { isSplitChild: true, isSplitAce: true })],
    });
    expect(legalActions(state, rules)).toEqual([]);
  });
});

describe('applyAction totality (FR-015, contracts/engine-api.md)', () => {
  it('FR-015: an action outside the legal set returns the state unchanged', () => {
    const state = round({ playerHands: [hand('5,4,3')] }); // double is illegal here
    expect(applyAction(state, 'double', rules)).toBe(state);
  });

  it('FR-015: a second action on a resolved hand is ignored, not applied twice', () => {
    const state = round({ playerHands: [hand('10,6', { status: 'stood' })] });
    expect(applyAction(state, 'hit', rules)).toBe(state);
  });

  it('FR-015: an illegal action never throws', () => {
    const state = round({ phase: 'settled' });
    expect(() => applyAction(state, 'split', rules)).not.toThrow();
    expect(applyAction(state, 'split', rules)).toBe(state);
  });

  it('FR-015: surrender is rejected while the rules forbid it', () => {
    const state = round({ playerHands: [hand('10,6')] });
    expect(applyAction(state, 'surrender', rules)).toBe(state);
  });
});
