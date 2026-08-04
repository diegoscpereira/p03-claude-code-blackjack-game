import { describe, expect, it } from 'vitest';
import { applyAction, startRound } from '../../../src/engine/round';
import { handTotal } from '../../../src/engine/hand';
import { PHASE_1_RULES } from '../../../src/engine/rules-config';
import { card, describeCards, hand, round, stackedShoe } from '../../helpers/hands';

/** T024 — FR-006, FR-007, FR-008: the reducer's transitions. */

const rules = PHASE_1_RULES;

describe('startRound (FR-005)', () => {
  it('FR-005: deals two cards to the player and two to the dealer', () => {
    const state = startRound({
      seed: 1,
      bet: 10,
      rules,
      bankroll: 1000,
      shoe: stackedShoe('10,6,8,9'),
    });
    expect(describeCards(state.playerHands[0]!.cards)).toBe('10,8');
    expect(describeCards(state.dealerHand.cards)).toBe('6,9');
  });

  it('FR-005: the dealer hole card starts hidden', () => {
    const state = startRound({ seed: 1, bet: 10, rules, bankroll: 1000 });
    expect(state.dealerHoleCardRevealed).toBe(false);
  });

  it('FR-005: the player owes the bet, so it leaves the available bankroll', () => {
    const state = startRound({ seed: 1, bet: 10, rules, bankroll: 1000 });
    expect(state.playerHands[0]!.bet).toBe(10);
    expect(state.availableBankroll).toBe(990);
  });

  it('FR-005: play begins in the player phase', () => {
    const state = startRound({
      seed: 1,
      bet: 10,
      rules,
      bankroll: 1000,
      shoe: stackedShoe('10,6,8,9'),
    });
    expect(state.phase).toBe('player');
    expect(state.activeHandIndex).toBe(0);
  });

  it('FR-016: builds a fresh shoe when none is carried over', () => {
    const state = startRound({ seed: 3, bet: 10, rules, bankroll: 1000 });
    expect(state.shoeSize).toBe(312);
    expect(state.shoe).toHaveLength(312 - 4);
  });

  it('FR-016: reuses a carried-over shoe rather than reshuffling mid-session', () => {
    // 200 of 312 remaining is well short of the 0.75 penetration point.
    const carried = new Array(200).fill(card('5'));
    const state = startRound({ seed: 3, bet: 10, rules, bankroll: 1000, shoe: carried, shoeSize: 312 });
    expect(state.shoe).toHaveLength(196);
  });

  it('FR-016: reshuffles when the carried-over shoe is past penetration', () => {
    const state = startRound({
      seed: 3,
      bet: 10,
      rules,
      bankroll: 1000,
      shoe: stackedShoe('10,6,8,9'),
      shoeSize: 312,
    });
    expect(state.shoe.length).toBeGreaterThan(300);
  });

  it('US1 acceptance 3: a natural settles the hand immediately', () => {
    const state = startRound({
      seed: 1,
      bet: 10,
      rules,
      bankroll: 1000,
      shoe: stackedShoe('A,6,K,9'),
    });
    expect(state.playerHands[0]!.status).toBe('blackjack');
    expect(state.phase).toBe('dealer');
  });
});

describe('applyAction — hit (FR-006)', () => {
  it('FR-006: deals one card to the active hand', () => {
    const state = round({ playerHands: [hand('10,6')], shoe: stackedShoe('4') });
    const next = applyAction(state, 'hit', rules);
    expect(describeCards(next.playerHands[0]!.cards)).toBe('10,6,4');
    expect(next.playerHands[0]!.status).toBe('active');
  });

  it('FR-006: ends the hand when the total exceeds 21', () => {
    const state = round({ playerHands: [hand('10,6')], shoe: stackedShoe('9') });
    const next = applyAction(state, 'hit', rules);
    expect(handTotal(next.playerHands[0]!.cards).total).toBe(25);
    expect(next.playerHands[0]!.status).toBe('busted');
  });

  it('US1 acceptance 2: a bust ends the round without the dealer drawing further', () => {
    const state = round({ playerHands: [hand('10,6')], shoe: stackedShoe('9') });
    const next = applyAction(state, 'hit', rules);
    expect(next.phase).toBe('dealer');
    expect(next.dealerHand.cards).toHaveLength(2);
  });

  it('FR-006: hitting to exactly 21 does not end the hand automatically', () => {
    const state = round({ playerHands: [hand('10,6')], shoe: stackedShoe('5') });
    const next = applyAction(state, 'hit', rules);
    expect(next.playerHands[0]!.status).toBe('active');
    expect(next.phase).toBe('player');
  });
});

describe('applyAction — stand (FR-007)', () => {
  it('FR-007: ends the active hand', () => {
    const next = applyAction(round({ playerHands: [hand('10,8')] }), 'stand', rules);
    expect(next.playerHands[0]!.status).toBe('stood');
  });

  it('FR-007: advances to dealer play when no hand remains', () => {
    const next = applyAction(round({ playerHands: [hand('10,8')] }), 'stand', rules);
    expect(next.phase).toBe('dealer');
  });

  it('FR-007: advances to the next hand when one remains', () => {
    const state = round({
      playerHands: [hand('10,8', { id: 'h1' }), hand('9,5', { id: 'h2' })],
      activeHandIndex: 0,
    });
    const next = applyAction(state, 'stand', rules);
    expect(next.phase).toBe('player');
    expect(next.activeHandIndex).toBe(1);
  });
});

describe('applyAction — double (FR-008)', () => {
  it('FR-008: doubles the bet, deals exactly one card, and ends the hand', () => {
    const state = round({ playerHands: [hand('5,6', { bet: 10 })], shoe: stackedShoe('9,3') });
    const next = applyAction(state, 'double', rules);
    const doubled = next.playerHands[0]!;
    expect(doubled.bet).toBe(20);
    expect(describeCards(doubled.cards)).toBe('5,6,9');
    expect(doubled.doubled).toBe(true);
    expect(doubled.status).toBe('stood');
  });

  it('FR-008: takes the extra bet from the available bankroll', () => {
    const state = round({ playerHands: [hand('5,6', { bet: 10 })], availableBankroll: 100 });
    expect(applyAction(state, 'double', rules).availableBankroll).toBe(90);
  });

  it('FR-008: a doubled hand that busts is marked busted, not stood', () => {
    const state = round({ playerHands: [hand('10,6', { bet: 10 })], shoe: stackedShoe('K') });
    expect(applyAction(state, 'double', rules).playerHands[0]!.status).toBe('busted');
  });
});

describe('applyAction — purity (contracts/engine-api.md)', () => {
  it('FR-003: never mutates the state it was given', () => {
    const state = round({ playerHands: [hand('10,6')], shoe: stackedShoe('4,5,6') });
    const snapshot = structuredClone(state);
    applyAction(state, 'hit', rules);
    expect(state).toEqual(snapshot);
  });

  it('FR-003: returns a new state object rather than the same reference', () => {
    const state = round({ playerHands: [hand('10,6')], shoe: stackedShoe('4') });
    expect(applyAction(state, 'hit', rules)).not.toBe(state);
  });

  it('FR-014: records every action in the round log', () => {
    let state = round({ playerHands: [hand('2,3')], shoe: stackedShoe('4,5,6') });
    state = applyAction(state, 'hit', rules);
    state = applyAction(state, 'stand', rules);
    expect(state.actionLog.map((a) => a.action)).toEqual(['hit', 'stand']);
  });

  it('FR-016: the shoe only ever shrinks within a round', () => {
    let state = round({ playerHands: [hand('2,3')], shoe: stackedShoe('4,5,6,7') });
    const before = state.shoe.length;
    state = applyAction(state, 'hit', rules);
    expect(state.shoe.length).toBe(before - 1);
  });
});
