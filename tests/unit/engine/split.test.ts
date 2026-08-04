import { describe, expect, it } from 'vitest';
import { applyAction } from '../../../src/engine/round';
import { legalActions } from '../../../src/engine/rules';
import { handTotal, isNatural } from '../../../src/engine/hand';
import { PHASE_1_RULES } from '../../../src/engine/rules-config';
import { describeCards, hand, round, stackedShoe } from '../../helpers/hands';

/** T025 — FR-009, FR-010, FR-011: split, resplit, and the split-Ace rule. */

const rules = PHASE_1_RULES;

describe('split (FR-009)', () => {
  it('FR-009: creates two hands, each carrying the original bet', () => {
    const state = round({
      playerHands: [hand('8,8', { bet: 10 })],
      shoe: stackedShoe('3,5'),
    });
    const next = applyAction(state, 'split', rules);
    expect(next.playerHands).toHaveLength(2);
    expect(next.playerHands.map((h) => h.bet)).toEqual([10, 10]);
  });

  it('FR-009: deals one card to each new hand', () => {
    const state = round({ playerHands: [hand('8,8')], shoe: stackedShoe('3,5') });
    const next = applyAction(state, 'split', rules);
    expect(describeCards(next.playerHands[0]!.cards)).toBe('8,3');
    expect(describeCards(next.playerHands[1]!.cards)).toBe('8,5');
  });

  it('FR-009: takes the second bet from the available bankroll', () => {
    const state = round({
      playerHands: [hand('8,8', { bet: 10 })],
      shoe: stackedShoe('3,5'),
      availableBankroll: 100,
    });
    expect(applyAction(state, 'split', rules).availableBankroll).toBe(90);
  });

  it('FR-009: the player acts on the first hand before the second', () => {
    const state = round({ playerHands: [hand('8,8')], shoe: stackedShoe('3,5') });
    const next = applyAction(state, 'split', rules);
    expect(next.activeHandIndex).toBe(0);
    expect(next.phase).toBe('player');
  });

  it('FR-009: both new hands are marked as split children', () => {
    const state = round({ playerHands: [hand('8,8')], shoe: stackedShoe('3,5') });
    const next = applyAction(state, 'split', rules);
    expect(next.playerHands.every((h) => h.isSplitChild)).toBe(true);
  });

  it('FR-009: split hands get distinct ids', () => {
    const state = round({ playerHands: [hand('8,8')], shoe: stackedShoe('3,5') });
    const ids = applyAction(state, 'split', rules).playerHands.map((h) => h.id);
    expect(new Set(ids).size).toBe(2);
  });
});

describe('resplit up to the four-hand cap (FR-010)', () => {
  it('FR-010: a pair dealt to a split hand may be split again', () => {
    let state = round({ playerHands: [hand('8,8')], shoe: stackedShoe('8,5,2') });
    state = applyAction(state, 'split', rules);
    expect(describeCards(state.playerHands[0]!.cards)).toBe('8,8');
    expect(legalActions(state, rules)).toContain('split');
    state = applyAction(state, 'split', rules);
    expect(state.playerHands).toHaveLength(3);
  });

  it('FR-010: Split stops being offered once four hands exist', () => {
    let state = round({ playerHands: [hand('8,8')], shoe: stackedShoe('8,8,8,2,3,4') });
    state = applyAction(state, 'split', rules); // 2 hands
    state = applyAction(state, 'split', rules); // 3 hands
    state = applyAction(state, 'split', rules); // 4 hands
    expect(state.playerHands).toHaveLength(4);
    expect(legalActions(state, rules)).not.toContain('split');
  });

  it('FR-010: a fifth split is refused and leaves the state untouched', () => {
    let state = round({ playerHands: [hand('8,8')], shoe: stackedShoe('8,8,8,8,3,4') });
    state = applyAction(state, 'split', rules);
    state = applyAction(state, 'split', rules);
    state = applyAction(state, 'split', rules);
    expect(applyAction(state, 'split', rules)).toBe(state);
  });
});

describe('split Aces (FR-011)', () => {
  it('FR-011: each Ace receives exactly one card', () => {
    const state = round({ playerHands: [hand('A,A')], shoe: stackedShoe('9,K') });
    const next = applyAction(state, 'split', rules);
    expect(next.playerHands[0]!.cards).toHaveLength(2);
    expect(next.playerHands[1]!.cards).toHaveLength(2);
  });

  it('FR-011: both hands stand automatically', () => {
    const state = round({ playerHands: [hand('A,A')], shoe: stackedShoe('9,K') });
    const next = applyAction(state, 'split', rules);
    expect(next.playerHands.map((h) => h.status)).toEqual(['stood', 'stood']);
    expect(next.phase).toBe('dealer');
  });

  it('FR-011: a ten on a split Ace counts as 21 but is not a natural', () => {
    const state = round({ playerHands: [hand('A,A')], shoe: stackedShoe('K,9') });
    const next = applyAction(state, 'split', rules);
    const first = next.playerHands[0]!;
    expect(handTotal(first.cards).total).toBe(21);
    expect(first.status).toBe('stood');
    expect(isNatural(first)).toBe(false);
  });

  it('FR-024a: the forced stand produces no decision to score', () => {
    const state = round({ playerHands: [hand('A,A')], shoe: stackedShoe('9,K') });
    const next = applyAction(state, 'split', rules);
    expect(next.decisions).toHaveLength(0);
  });

  it('FR-036: the forced stand is still recorded in the action log, marked automatic', () => {
    const state = round({ playerHands: [hand('A,A')], shoe: stackedShoe('9,K') });
    const next = applyAction(state, 'split', rules);
    const automatic = next.actionLog.filter((entry) => entry.automatic);
    expect(automatic).toHaveLength(2);
    expect(automatic.every((entry) => entry.action === 'stand')).toBe(true);
  });

  it('FR-011: split Aces cannot be resplit into a third Ace hand', () => {
    const state = round({ playerHands: [hand('A,A')], shoe: stackedShoe('A,K') });
    const next = applyAction(state, 'split', rules);
    // The first hand is A,A again — but it is a resolved split-Ace hand, so it
    // offers nothing at all rather than offering another split.
    expect(legalActions(next, rules)).toEqual([]);
  });
});
