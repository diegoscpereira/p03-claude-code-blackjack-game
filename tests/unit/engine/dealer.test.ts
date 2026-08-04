import { describe, expect, it } from 'vitest';
import { playDealer } from '../../../src/engine/dealer';
import { handTotal } from '../../../src/engine/hand';
import { PHASE_1_RULES } from '../../../src/engine/rules-config';
import { describeCards, hand, round, stackedShoe } from '../../helpers/hands';

/** T026 — FR-012: the dealer draws to hard 17 and hits soft 17. */

const rules = PHASE_1_RULES;

const dealerRound = (dealerCards: string, shoe: string) =>
  round({
    phase: 'dealer',
    playerHands: [hand('10,8', { status: 'stood' })],
    dealerHand: hand(dealerCards, { id: 'dealer' }),
    shoe: stackedShoe(shoe),
  });

describe('playDealer (FR-012)', () => {
  it('FR-012: reveals the hole card', () => {
    const next = playDealer(dealerRound('10,7', ''), rules);
    expect(next.dealerHoleCardRevealed).toBe(true);
  });

  it('FR-012: stands on a hard 17', () => {
    const next = playDealer(dealerRound('10,7', '5'), rules);
    expect(describeCards(next.dealerHand.cards)).toBe('10,7');
    expect(handTotal(next.dealerHand.cards).total).toBe(17);
  });

  it('FR-012: draws below 17', () => {
    const next = playDealer(dealerRound('10,6', '5'), rules);
    expect(describeCards(next.dealerHand.cards)).toBe('10,6,5');
  });

  it('FR-012: keeps drawing until it reaches hard 17', () => {
    const next = playDealer(dealerRound('2,3', '4,5,6'), rules);
    expect(handTotal(next.dealerHand.cards).total).toBeGreaterThanOrEqual(17);
  });

  it('FR-012: hits soft 17 under these house rules', () => {
    const next = playDealer(dealerRound('A,6', '3'), rules);
    expect(describeCards(next.dealerHand.cards)).toBe('A,6,3');
    expect(handTotal(next.dealerHand.cards).total).toBe(20);
  });

  it('FR-012: stands on soft 17 when the rules say so', () => {
    const next = playDealer(dealerRound('A,6', '3'), { ...rules, dealerHitsSoft17: false });
    expect(describeCards(next.dealerHand.cards)).toBe('A,6');
  });

  it('FR-012: stands on a soft 18', () => {
    const next = playDealer(dealerRound('A,7', '3'), rules);
    expect(describeCards(next.dealerHand.cards)).toBe('A,7');
  });

  it('FR-012: marks the dealer busted past 21', () => {
    const next = playDealer(dealerRound('10,6', 'K'), rules);
    expect(next.dealerHand.status).toBe('busted');
    expect(handTotal(next.dealerHand.cards).total).toBe(26);
  });

  it('FR-012: demotes an Ace rather than busting', () => {
    // A,5 is a soft 16. Drawing a K makes it a *hard* 16, not a 26 bust, so
    // the dealer must keep drawing.
    const next = playDealer(dealerRound('A,5', 'K,4'), rules);
    expect(describeCards(next.dealerHand.cards)).toBe('A,5,K,4');
    expect(next.dealerHand.status).toBe('stood');
    expect(handTotal(next.dealerHand.cards).total).toBe(20);
  });

  it('FR-012: stops drawing when the shoe runs dry rather than throwing', () => {
    const next = playDealer(dealerRound('A,5', 'K'), rules);
    expect(next.dealerHand.cards).toHaveLength(3);
    expect(next.phase).toBe('settled');
  });

  it('FR-012: does not draw while player hands are still live', () => {
    const notYet = round({ phase: 'player', shoe: stackedShoe('5') });
    expect(playDealer(notYet, rules)).toBe(notYet);
  });

  it('US1 acceptance 2: does not draw when every player hand has busted', () => {
    const state = round({
      phase: 'dealer',
      playerHands: [hand('10,6,9', { status: 'busted' })],
      dealerHand: hand('10,6', { id: 'dealer' }),
      shoe: stackedShoe('5'),
    });
    const next = playDealer(state, rules);
    expect(describeCards(next.dealerHand.cards)).toBe('10,6');
    expect(next.dealerHoleCardRevealed).toBe(true);
  });

  it('FR-003: does not mutate the state it was given', () => {
    const state = dealerRound('10,6', '5');
    const snapshot = structuredClone(state);
    playDealer(state, rules);
    expect(state).toEqual(snapshot);
  });

  it('FR-012: moves the round to the settled phase', () => {
    expect(playDealer(dealerRound('10,7', ''), rules).phase).toBe('settled');
  });
});
