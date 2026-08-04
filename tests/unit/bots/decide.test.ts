import { describe, expect, it } from 'vitest';
import { decide } from '../../../src/bots/decide';
import { BOT_PROFILES } from '../../../src/bots/profiles';
import { createRng } from '../../../src/engine/rng';
import { legalActions } from '../../../src/engine/rules';
import { PHASE_1_RULES } from '../../../src/engine/rules-config';
import { hand, round } from '../../helpers/hands';
import type { BotProfileId } from '../../../src/engine/types';

/** T079 — FR-031: bot decisions are reproducible from the round seed. */

const rules = PHASE_1_RULES;
const PROFILE_IDS = Object.keys(BOT_PROFILES) as BotProfileId[];

const botRound = (player: string, dealer: string) =>
  round({
    playerHands: [hand(player, { id: 'bot-1' })],
    dealerHand: hand(`${dealer},7`, { id: 'dealer' }),
  });

describe('decide (FR-031)', () => {
  it.each(PROFILE_IDS)('FR-031: %s decides identically from the same seed', (profileId) => {
    const state = botRound('10,6', '10');
    const first = decide(profileId, state, rules, createRng(42));
    const second = decide(profileId, state, rules, createRng(42));
    expect(first).toBe(second);
  });

  it.each(PROFILE_IDS)('FR-031: %s always returns a legal action', (profileId) => {
    for (const player of ['10,6', 'A,7', '8,8', '5,6', '5,4,3', 'A,A']) {
      for (const dealer of ['2', '6', '9', '10', 'A']) {
        const state = botRound(player, dealer);
        const chosen = decide(profileId, state, rules, createRng(7));
        expect(legalActions(state, rules)).toContain(chosen);
      }
    }
  });

  it.each(PROFILE_IDS)('FR-031: %s stands when nothing else is legal', (profileId) => {
    const resolved = round({ playerHands: [hand('10,6', { id: 'bot-1', status: 'busted' })] });
    expect(decide(profileId, resolved, rules, createRng(1))).toBe('stand');
  });

  it('FR-031: a whole seeded session replays identically', () => {
    const play = (seed: number) => {
      const rng = createRng(seed);
      return PROFILE_IDS.flatMap((id) =>
        ['10,6', 'A,7', '9,9', '5,6'].map((player) =>
          decide(id, botRound(player, '10'), rules, rng),
        ),
      );
    };
    expect(play(2024)).toEqual(play(2024));
  });

  it('FR-003: deciding never mutates the state it was given', () => {
    const state = botRound('10,6', '10');
    const snapshot = structuredClone(state);
    for (const id of PROFILE_IDS) decide(id, state, rules, createRng(3));
    expect(state).toEqual(snapshot);
  });
});
