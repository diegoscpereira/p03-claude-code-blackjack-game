import { describe, expect, it } from 'vitest';
import { replayHandLog, replayRound } from '../../../src/engine/replay';
import { startRound, applyAction } from '../../../src/engine/round';
import { playDealer } from '../../../src/engine/dealer';
import { settle } from '../../../src/engine/settle';
import { PHASE_1_RULES } from '../../../src/engine/rules-config';
import type { Action, ActionRecord } from '../../../src/engine/types';

/**
 * T113 — SC-008: *"A reviewer can reproduce any recorded hand's exact outcome
 * from its seed and action list, with a 100% match rate across repeated runs."*
 *
 * This is the test User Story 7 exists for. Every other claim in this
 * repository about determinism is a claim about a component; this one is about
 * the artefact a reviewer actually holds — a row in `hand_logs` — and whether
 * it is enough to rebuild the hand it describes.
 */

const rules = PHASE_1_RULES;
const SEED = 20260804;

/** Plays a round for real, and returns both the log and what it settled to. */
function playForReal(seed: number, actions: readonly Action[]) {
  let state = startRound({ seed, bet: 10, rules, bankroll: 1000 });
  for (const action of actions) {
    if (state.phase !== 'player') break;
    state = applyAction(state, action, rules);
  }
  const played = playDealer(state, rules);
  return { state: played, settled: settle(played, rules) };
}

describe('replaying a recorded hand (FR-014, SC-008)', () => {
  it('SC-008: a stand replays to the identical cards and settlement', () => {
    const original = playForReal(SEED, ['stand']);

    const replayed = replayRound({
      seed: SEED,
      bet: 10,
      rules,
      actions: original.state.actionLog,
    });

    expect(replayed.state.playerHands).toEqual(original.state.playerHands);
    expect(replayed.state.dealerHand).toEqual(original.state.dealerHand);
    expect(replayed.settled).toEqual(original.settled);
  });

  it('SC-008: a multi-card hand replays exactly', () => {
    const original = playForReal(SEED, ['hit', 'hit', 'stand']);

    const replayed = replayRound({
      seed: SEED,
      bet: 10,
      rules,
      actions: original.state.actionLog,
    });

    expect(replayed.state.playerHands).toEqual(original.state.playerHands);
    expect(replayed.settled.totalNetChange).toBe(original.settled.totalNetChange);
  });

  it('SC-008: 100% match across repeated runs of the same log', () => {
    const original = playForReal(SEED, ['hit', 'stand']);
    const options = { seed: SEED, bet: 10, rules, actions: original.state.actionLog };

    const runs = Array.from({ length: 20 }, () => replayRound(options));

    for (const run of runs) {
      expect(run.settled).toEqual(original.settled);
      expect(run.state.playerHands).toEqual(original.state.playerHands);
    }
  });

  it('SC-008: replays across a range of seeds, not one lucky one', () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const original = playForReal(seed, ['hit', 'stand']);
      const replayed = replayRound({ seed, bet: 10, rules, actions: original.state.actionLog });
      expect(replayed.settled).toEqual(original.settled);
    }
  });

  it('FR-014: the emitted hand log alone is enough to replay', () => {
    const original = playForReal(SEED, ['hit', 'stand']);

    // The reviewer's actual starting point: a stored record, nothing else.
    const replayed = replayHandLog(original.settled.handLog, { bet: 10, rules });

    expect(replayed.settled.handLog).toEqual(original.settled.handLog);
  });

  it('FR-011: the forced split-Ace stand is regenerated, not replayed from the log', () => {
    // Automatic actions are recorded for the analysis view but are the engine's
    // own doing. Re-applying them would consume a turn the player never took.
    const log: ActionRecord[] = [
      { handId: 'h1', action: 'stand', automatic: true },
      { handId: 'h1', action: 'stand' },
    ];
    const replayed = replayRound({ seed: SEED, bet: 10, rules, actions: log });
    expect(replayed.state.phase).toBe('settled');
  });

  it('FR-015: an action the rules refuse leaves the replay in a playable state', () => {
    const log: ActionRecord[] = [
      { handId: 'h1', action: 'split' },
      { handId: 'h1', action: 'stand' },
    ];
    // Most hands cannot split. The reducer is total, so the replay must survive
    // a log that no longer matches the rules it was recorded under.
    expect(() => replayRound({ seed: SEED, bet: 10, rules, actions: log })).not.toThrow();
  });

  it('SC-008: an empty action list replays the deal and stops there', () => {
    const replayed = replayRound({ seed: SEED, bet: 10, rules, actions: [] });

    expect(replayed.state.playerHands[0]?.cards).toHaveLength(2);
    // Still the player's turn, and deliberately so. A log with no actions
    // describes a hand that was never played out; settling it anyway would
    // invent a stand the player never took, which is a worse answer than an
    // unfinished replay.
    expect(replayed.state.phase).toBe('player');
  });

  it('SC-008: a natural needs no actions to replay, because none were taken', () => {
    // Seeds are searched rather than hard-coded so this stays true if the
    // shuffle changes; a natural is common enough that 400 seeds always finds one.
    const naturalSeed = Array.from({ length: 400 }, (_, i) => i + 1).find(
      (seed) => startRound({ seed, bet: 10, rules, bankroll: 1000 }).phase !== 'player',
    );
    expect(naturalSeed).toBeDefined();

    const replayed = replayRound({ seed: naturalSeed!, bet: 10, rules, actions: [] });
    expect(replayed.state.phase).toBe('settled');
    expect(replayed.settled.handLog.outcome).toBeDefined();
  });

  it('FR-035: bot actions in the log are replayed, because they moved the shoe', () => {
    const botSeats = [
      { id: 'b1', name: 'Bot One', profileId: 'conservative-math' as const, bet: 10 },
    ];
    const dealt = startRound({ seed: SEED, bet: 10, rules, bankroll: 1000, botSeats });

    // A bot that hits consumes a card the player would otherwise have drawn, so
    // a replay that skipped bot turns would deal the player a different hand.
    const withBot: ActionRecord[] = [
      { handId: 'bot-b1', action: 'hit', botId: 'b1' },
      { handId: 'h1', action: 'stand' },
    ];
    const replayed = replayRound({ seed: SEED, bet: 10, rules, actions: withBot, botSeats });

    expect(replayed.state.botSeats[0]?.hand.cards.length).toBe(3);
    expect(replayed.state.playerHands[0]?.cards).toEqual(dealt.playerHands[0]?.cards);
  });

  it('FR-004: a different seed produces a different hand, so the seed is doing the work', () => {
    const a = replayRound({ seed: 1, bet: 10, rules, actions: [] });
    const b = replayRound({ seed: 2, bet: 10, rules, actions: [] });
    expect(a.state.playerHands[0]?.cards).not.toEqual(b.state.playerHands[0]?.cards);
  });
});
