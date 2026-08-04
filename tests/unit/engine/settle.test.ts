import { describe, expect, it } from 'vitest';
import { settle } from '../../../src/engine/settle';
import { PHASE_1_RULES } from '../../../src/engine/rules-config';
import { hand, round } from '../../helpers/hands';
import type { Hand } from '../../../src/engine/types';

/** T027 — FR-013, FR-014: payouts and the emitted hand record. */

const rules = PHASE_1_RULES;

const settled = (playerHands: Hand[], dealerCards: string, dealerStatus: Hand['status'] = 'stood') =>
  settle(
    round({
      phase: 'settled',
      playerHands,
      dealerHand: hand(dealerCards, { id: 'dealer', status: dealerStatus }),
      dealerHoleCardRevealed: true,
    }),
    rules,
  );

describe('settle — payouts (FR-013)', () => {
  it('FR-013: a natural pays 3:2', () => {
    const result = settled([hand('A,K', { bet: 10, status: 'blackjack' })], '10,7');
    expect(result.hands[0]).toMatchObject({ outcome: 'blackjack', netChange: 15 });
  });

  it('FR-013: a natural against a dealer natural pushes', () => {
    const result = settled([hand('A,K', { bet: 10, status: 'blackjack' })], 'A,K', 'blackjack');
    expect(result.hands[0]).toMatchObject({ outcome: 'push', netChange: 0 });
  });

  it('FR-013: a plain win pays 1:1', () => {
    const result = settled([hand('10,9', { bet: 10, status: 'stood' })], '10,7');
    expect(result.hands[0]).toMatchObject({ outcome: 'win', netChange: 10 });
  });

  it('FR-013: an equal total pushes', () => {
    const result = settled([hand('10,7', { bet: 10, status: 'stood' })], '10,7');
    expect(result.hands[0]).toMatchObject({ outcome: 'push', netChange: 0 });
  });

  it('FR-013: a lower total loses the bet', () => {
    const result = settled([hand('10,6', { bet: 10, status: 'stood' })], '10,7');
    expect(result.hands[0]).toMatchObject({ outcome: 'loss', netChange: -10 });
  });

  it('FR-013: a busted hand loses even when the dealer also busts', () => {
    const result = settled([hand('10,6,9', { bet: 10, status: 'busted' })], '10,6,K', 'busted');
    expect(result.hands[0]).toMatchObject({ outcome: 'bust', netChange: -10 });
  });

  it('FR-013: a standing hand wins when the dealer busts', () => {
    const result = settled([hand('10,6', { bet: 10, status: 'stood' })], '10,6,K', 'busted');
    expect(result.hands[0]).toMatchObject({ outcome: 'win', netChange: 10 });
  });

  it('FR-013: a doubled winning hand pays on the doubled bet', () => {
    const result = settled(
      [hand('5,6,10', { bet: 20, status: 'stood', doubled: true })],
      '10,7',
    );
    expect(result.hands[0]!.netChange).toBe(20);
  });

  it('FR-011: 21 on a split Ace beats 20 but pays 1:1, not 3:2', () => {
    const result = settled(
      [hand('A,K', { bet: 10, status: 'stood', isSplitChild: true, isSplitAce: true })],
      '10,10',
    );
    expect(result.hands[0]).toMatchObject({ outcome: 'win', netChange: 10 });
  });
});

describe('settle — the sum invariant (contracts/engine-api.md)', () => {
  it('FR-013: totalNetChange equals the sum of per-hand netChange', () => {
    const result = settled(
      [
        hand('10,9', { id: 'h1', bet: 10, status: 'stood' }),
        hand('10,6,9', { id: 'h2', bet: 10, status: 'busted' }),
        hand('10,7', { id: 'h3', bet: 10, status: 'stood' }),
      ],
      '10,7',
    );
    const sum = result.hands.reduce((total, h) => total + h.netChange, 0);
    expect(result.totalNetChange).toBe(sum);
    expect(result.totalNetChange).toBe(0); // +10, -10, 0
  });

  it('FR-013: settles each of four split hands independently', () => {
    const result = settled(
      [
        hand('10,9', { id: 'h1', bet: 10, status: 'stood', isSplitChild: true }),
        hand('10,9', { id: 'h2', bet: 10, status: 'stood', isSplitChild: true }),
        hand('10,9', { id: 'h3', bet: 10, status: 'stood', isSplitChild: true }),
        hand('10,9', { id: 'h4', bet: 10, status: 'stood', isSplitChild: true }),
      ],
      '10,7',
    );
    expect(result.hands).toHaveLength(4);
    expect(result.totalNetChange).toBe(40);
  });
});

describe('settle — the hand record (FR-014)', () => {
  it('FR-014: records the seed, so the round can be replayed', () => {
    const state = round({
      seed: 918273645,
      phase: 'settled',
      playerHands: [hand('10,9', { bet: 10, status: 'stood' })],
      dealerHand: hand('10,7', { id: 'dealer', status: 'stood' }),
    });
    expect(settle(state, rules).handLog.seed).toBe(918273645);
  });

  it('FR-014: records the dealer upcard', () => {
    const result = settled([hand('10,9', { bet: 10, status: 'stood' })], '6,K');
    expect(result.handLog.dealerUpcard).toBe('6');
  });

  it('FR-014: records the final totals for player and dealer', () => {
    const result = settled(
      [
        hand('10,9', { id: 'h1', bet: 10, status: 'stood' }),
        hand('10,8', { id: 'h2', bet: 10, status: 'stood' }),
      ],
      '10,7',
    );
    expect(result.handLog.finalTotals).toEqual({ player: [19, 18], dealer: 17 });
  });

  it('FR-014: records the net bankroll change for the round', () => {
    const result = settled([hand('10,9', { bet: 10, status: 'stood' })], '10,7');
    expect(result.handLog.netChange).toBe(10);
  });

  it('FR-014: reports a natural as the round outcome', () => {
    const result = settled([hand('A,K', { bet: 10, status: 'blackjack' })], '10,7');
    expect(result.handLog.outcome).toBe('blackjack');
  });

  it('FR-014: reports a bust when every player hand busted', () => {
    const result = settled([hand('10,6,9', { bet: 10, status: 'busted' })], '10,7');
    expect(result.handLog.outcome).toBe('bust');
  });

  it('FR-014: carries no clock reading or identifier — sync adds those', () => {
    const result = settled([hand('10,9', { bet: 10, status: 'stood' })], '10,7');
    expect(result.handLog).not.toHaveProperty('playedAt');
    expect(result.handLog).not.toHaveProperty('handId');
    expect(result.handLog).not.toHaveProperty('playerId');
  });
});
