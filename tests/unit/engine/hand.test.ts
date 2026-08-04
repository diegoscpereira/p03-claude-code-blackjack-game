import { describe, expect, it } from 'vitest';
import { handTotal, isBust, isNatural, cardValue } from '../../../src/engine/hand';
import { cards, hand } from '../../helpers/hands';

/**
 * T021 — FR-001: Aces count 11 unless that would exceed 21, then 1.
 *
 * The table below is lifted directly from contracts/engine-api.md. If the
 * contract changes, this fails first.
 */
describe('handTotal (FR-001)', () => {
  const CONTRACT_TABLE: [string, number, boolean][] = [
    ['A,6', 17, true],
    ['A,6,10', 17, false],
    ['A,A', 12, true],
    ['A,A,9', 21, true],
    ['10,6', 16, false],
  ];

  it.each(CONTRACT_TABLE)(
    'FR-001: %s totals %i (soft: %s), per contracts/engine-api.md',
    (shorthand, total, isSoft) => {
      expect(handTotal(cards(shorthand))).toEqual({ total, isSoft });
    },
  );

  it('FR-001: counts every face card as ten', () => {
    expect(handTotal(cards('J,Q')).total).toBe(20);
    expect(handTotal(cards('K,10')).total).toBe(20);
  });

  it('FR-001: demotes exactly as many Aces as it must', () => {
    // Four Aces cannot all be 11. One stays soft: 11 + 1 + 1 + 1 = 14.
    expect(handTotal(cards('A,A,A,A'))).toEqual({ total: 14, isSoft: true });
    // Adding a ten forces the last Ace down too: 1 + 1 + 1 + 1 + 10 = 14.
    expect(handTotal(cards('A,A,A,A,10'))).toEqual({ total: 14, isSoft: false });
  });

  it('FR-001: a soft hand becomes hard once the Ace must count as one', () => {
    expect(handTotal(cards('A,5'))).toEqual({ total: 16, isSoft: true });
    expect(handTotal(cards('A,5,10'))).toEqual({ total: 16, isSoft: false });
  });

  it('FR-001: an empty hand totals zero rather than throwing', () => {
    expect(handTotal([])).toEqual({ total: 0, isSoft: false });
  });

  it('FR-001: a five-card hand under 21 keeps its exact total', () => {
    expect(handTotal(cards('2,3,4,5,6')).total).toBe(20);
  });
});

describe('cardValue (FR-001)', () => {
  it('FR-001: an Ace has no fixed value, so it reports its high value', () => {
    expect(cardValue('A')).toBe(11);
  });

  it.each([
    ['2', 2],
    ['9', 9],
    ['10', 10],
    ['J', 10],
    ['Q', 10],
    ['K', 10],
  ])('FR-001: %s is worth %i', (rank, value) => {
    expect(cardValue(rank as never)).toBe(value);
  });
});

describe('isBust (FR-006)', () => {
  it('FR-006: a total over 21 busts', () => {
    expect(isBust(cards('10,6,9'))).toBe(true);
  });

  it('FR-006: exactly 21 does not bust', () => {
    expect(isBust(cards('10,6,5'))).toBe(false);
  });

  it('FR-006: a soft hand that can demote an Ace does not bust', () => {
    expect(isBust(cards('A,6,10'))).toBe(false);
  });
});

describe('isNatural (FR-011)', () => {
  it('FR-011: two cards totalling 21 on an unsplit hand is a natural', () => {
    expect(isNatural(hand('A,K'))).toBe(true);
  });

  it('FR-011: a ten on a split Ace is 21 but not a natural', () => {
    expect(isNatural(hand('A,K', { isSplitChild: true, isSplitAce: true }))).toBe(false);
  });

  it('FR-011: no split hand can hold a natural, Ace or otherwise', () => {
    expect(isNatural(hand('A,K', { isSplitChild: true }))).toBe(false);
  });

  it('FR-011: three cards totalling 21 is not a natural', () => {
    expect(isNatural(hand('7,7,7'))).toBe(false);
  });

  it('FR-011: two cards under 21 is not a natural', () => {
    expect(isNatural(hand('A,9'))).toBe(false);
  });
});
