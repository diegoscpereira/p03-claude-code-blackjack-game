import { describe, expect, it } from 'vitest';
import { XP_PER_HAND, XP_PER_MATCHED_DECISION, xpForHand } from '../../../src/progression/xp';
import type { Decision } from '../../../src/engine/types';

/**
 * T089 — FR-050: 10 XP for the hand played, plus 2 XP for each decision in that
 * hand that matched the recommendation, awarded regardless of the outcome.
 *
 * The "regardless of win or loss" clause is the one worth testing hardest. XP
 * that tracked winning would reward variance rather than play quality, and the
 * whole progression ladder is meant to measure the latter.
 */

function decision(matched: boolean): Decision {
  return {
    handId: 'h1',
    playerTotal: 16,
    isSoft: false,
    dealerUpcard: '10',
    chosen: matched ? 'hit' : 'stand',
    recommended: 'hit',
    matched,
  };
}

describe('XP awards (FR-050)', () => {
  it('FR-050: awards 10 XP for a hand with no decisions', () => {
    expect(xpForHand([])).toBe(XP_PER_HAND);
  });

  it('FR-050: adds 2 XP per matched decision', () => {
    expect(xpForHand([decision(true)])).toBe(XP_PER_HAND + XP_PER_MATCHED_DECISION);
    expect(xpForHand([decision(true), decision(true)])).toBe(
      XP_PER_HAND + 2 * XP_PER_MATCHED_DECISION,
    );
  });

  it('FR-050: adds nothing for an unmatched decision', () => {
    expect(xpForHand([decision(false)])).toBe(XP_PER_HAND);
    expect(xpForHand([decision(false), decision(false), decision(false)])).toBe(XP_PER_HAND);
  });

  it('FR-050: counts only the matched decisions in a mixed hand', () => {
    expect(xpForHand([decision(true), decision(false), decision(true)])).toBe(
      XP_PER_HAND + 2 * XP_PER_MATCHED_DECISION,
    );
  });

  it('FR-050: the award does not depend on whether the hand was won or lost', () => {
    // There is no outcome parameter at all — the requirement is enforced by the
    // signature rather than by a branch that could later grow a condition.
    const decisions = [decision(true), decision(false)];
    expect(xpForHand(decisions)).toBe(XP_PER_HAND + XP_PER_MATCHED_DECISION);
  });

  it('FR-050: the award is always a positive integer', () => {
    for (const count of [0, 1, 2, 5, 10]) {
      const award = xpForHand(Array.from({ length: count }, () => decision(true)));
      expect(Number.isInteger(award)).toBe(true);
      expect(award).toBeGreaterThan(0);
    }
  });

  it('FR-050: the documented constants are the ones the spec fixes', () => {
    expect(XP_PER_HAND).toBe(10);
    expect(XP_PER_MATCHED_DECISION).toBe(2);
  });
});
