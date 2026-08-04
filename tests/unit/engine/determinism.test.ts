import { describe, expect, it } from 'vitest';
import { applyAction, startRound } from '../../../src/engine/round';
import { playDealer } from '../../../src/engine/dealer';
import { settle } from '../../../src/engine/settle';
import { legalActions } from '../../../src/engine/rules';
import { PHASE_1_RULES } from '../../../src/engine/rules-config';
import type { Action, RoundState, SettledRound } from '../../../src/engine/types';

/**
 * T029 — FR-004, SC-008: a full round is reproducible from its seed.
 *
 * This is the test that makes the "replayable from seed" claim real. Everything
 * User Story 7 promises a reviewer rests on it.
 */
const rules = PHASE_1_RULES;

/** Plays a whole round with a fixed policy, so the only variable is the seed. */
function playRound(seed: number, policy: Action[] = ['stand']): SettledRound & { state: RoundState } {
  let state = startRound({ seed, bet: 10, rules, bankroll: 1000 });
  let step = 0;

  while (state.phase === 'player') {
    const legal = legalActions(state, rules);
    if (legal.length === 0) break;
    const wanted = policy[step % policy.length] as Action;
    const action = legal.includes(wanted) ? wanted : 'stand';
    state = applyAction(state, action, rules);
    step += 1;
    if (step > 40) throw new Error('Round failed to terminate');
  }

  state = playDealer(state, rules);
  return { ...settle(state, rules), state };
}

describe('full-round determinism (FR-004, SC-008)', () => {
  it('SC-008: the same seed produces the same cards and the same settlement', () => {
    for (const seed of [1, 42, 12345, 987654321]) {
      const a = playRound(seed);
      const b = playRound(seed);
      expect(a.state.playerHands).toEqual(b.state.playerHands);
      expect(a.state.dealerHand).toEqual(b.state.dealerHand);
      expect(a.totalNetChange).toBe(b.totalNetChange);
      expect(a.handLog).toEqual(b.handLog);
    }
  });

  it('SC-008: repeated replays never drift, across many runs', () => {
    const first = playRound(777, ['hit', 'stand']);
    for (let i = 0; i < 25; i++) {
      expect(playRound(777, ['hit', 'stand']).handLog).toEqual(first.handLog);
    }
  });

  it('FR-004: different seeds generally produce different rounds', () => {
    const logs = new Set<string>();
    for (let seed = 0; seed < 40; seed++) {
      logs.add(JSON.stringify(playRound(seed).handLog.finalTotals));
    }
    expect(logs.size).toBeGreaterThan(10);
  });

  it('SC-008: the shoe dealt from a seed is identical every time', () => {
    const a = startRound({ seed: 555, bet: 10, rules, bankroll: 1000 });
    const b = startRound({ seed: 555, bet: 10, rules, bankroll: 1000 });
    expect(a.shoe).toEqual(b.shoe);
  });

  it('FR-003: the engine reads no clock — a round replays identically after a delay', async () => {
    const before = playRound(31337);
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(playRound(31337).handLog).toEqual(before.handLog);
  });

  it('FR-013: the settled total always equals the sum of its parts, for any seed', () => {
    for (let seed = 0; seed < 60; seed++) {
      const result = playRound(seed, ['hit', 'hit', 'stand']);
      const sum = result.hands.reduce((total, h) => total + h.netChange, 0);
      expect(result.totalNetChange).toBe(sum);
    }
  });
});
