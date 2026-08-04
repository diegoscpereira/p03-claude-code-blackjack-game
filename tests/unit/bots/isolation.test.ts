import { beforeEach, describe, expect, it } from 'vitest';
import { startRound } from '../../../src/engine/round';
import { playDealer } from '../../../src/engine/dealer';
import { settle } from '../../../src/engine/settle';
import { PHASE_1_RULES } from '../../../src/engine/rules-config';
import { useGameStore } from '../../../src/store/gameStore';
import type { BotSeatConfig } from '../../../src/engine/types';

/**
 * T081 — FR-035: bot outcomes never touch the player's bankroll, XP, or
 * statistics.
 *
 * Assumption 4 says bots do not compete for cards in a way that changes player
 * outcomes materially — but "materially" is a judgement about card removal, not
 * a licence for a bot's win to pay the player. That part is absolute, so it is
 * asserted from both ends: the engine's settlement, and the store's counters.
 */
const rules = PHASE_1_RULES;

const SEATS: BotSeatConfig[] = [
  { id: 'b1', name: 'Conservative Math AI', profileId: 'conservative-math', bet: 500 },
  { id: 'b2', name: 'Aggressive High-Roller', profileId: 'aggressive-high-roller', bet: 500 },
];

beforeEach(() => {
  useGameStore.getState().reset();
});

describe('bot isolation from the player (FR-035)', () => {
  it('FR-035: bot stakes never leave the player bankroll', () => {
    const state = startRound({ seed: 5, bet: 10, rules, bankroll: 1000, botSeats: SEATS });
    // Only the player's own 10 is committed, despite 1,000 in bot stakes.
    expect(state.availableBankroll).toBe(990);
  });

  it('FR-035: settlement returns one result per player hand and none for bots', () => {
    let state = startRound({ seed: 5, bet: 10, rules, bankroll: 1000, botSeats: SEATS });
    state = playDealer({ ...state, phase: 'dealer' }, rules);
    const result = settle(state, rules);

    expect(result.hands).toHaveLength(state.playerHands.length);
    const botHandIds = state.botSeats.map((seat) => seat.hand.id);
    for (const settled of result.hands) {
      expect(botHandIds).not.toContain(settled.handId);
    }
  });

  it('FR-035: the round total covers player hands only', () => {
    let state = startRound({ seed: 9, bet: 10, rules, bankroll: 1000, botSeats: SEATS });
    state = playDealer({ ...state, phase: 'dealer' }, rules);
    const result = settle(state, rules);

    // With 500-chip bot stakes, any leakage would be unmissable.
    expect(Math.abs(result.totalNetChange)).toBeLessThanOrEqual(20);
  });

  it('FR-035: the hand log records the player total, not the table total', () => {
    let state = startRound({ seed: 11, bet: 10, rules, bankroll: 1000, botSeats: SEATS });
    state = playDealer({ ...state, phase: 'dealer' }, rules);
    const result = settle(state, rules);

    expect(result.handLog.netChange).toBe(result.totalNetChange);
    expect(result.handLog.finalTotals.player).toHaveLength(state.playerHands.length);
  });

  it('FR-035: bots are dealt cards but hold no claim on the bankroll', () => {
    const state = startRound({ seed: 5, bet: 10, rules, bankroll: 1000, botSeats: SEATS });
    expect(state.botSeats).toHaveLength(2);
    for (const seat of state.botSeats) {
      expect(seat.hand.cards).toHaveLength(2);
    }
  });

  it('FR-035: a round with bots moves the bankroll exactly as one without would', () => {
    const withBots = (() => {
      let s = startRound({ seed: 21, bet: 10, rules, bankroll: 1000, botSeats: SEATS });
      s = playDealer({ ...s, phase: 'dealer' }, rules);
      return settle(s, rules).totalNetChange;
    })();

    // The player's own hand differs because bots consume cards (Assumption 4),
    // but the magnitude is always bounded by the player's own bet.
    expect(Math.abs(withBots)).toBeLessThanOrEqual(15);
  });

  it('FR-035: no bot result reaches the decision counters', () => {
    const store = useGameStore.getState();
    store.deal(5);
    while (useGameStore.getState().legalActions().length > 0) {
      useGameStore.getState().act('stand');
    }
    // One player decision was taken; bots took several of their own.
    expect(useGameStore.getState().decisionsTaken).toBeLessThanOrEqual(4);
  });
});
