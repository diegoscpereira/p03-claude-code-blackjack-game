import type { BotProfileId } from '../engine/types';

/**
 * T083 — the two bot profiles (FR-032, spec Assumption 5).
 *
 * FR-031 requires each bot to have a *named, documented* playstyle that
 * determines its decisions. The documentation is not decoration: without a
 * stated rule, a deviating bot is indistinguishable from a bug, and the
 * contrast User Story 5 wants to teach becomes noise.
 *
 * Every deviation below is expressed as a probability consumed from the
 * injected `Rng`, so a bot's whole session replays from the round seed.
 */

/** FR-033: how long a bot's action is shown before play advances. */
export const BOT_TURN_MS = 600;

export interface BotProfile {
  readonly id: BotProfileId;
  readonly name: string;
  /** Shown in the UI, and the contract the profile tests hold it to. */
  readonly description: string;
  /** Stake relative to the player's bet. Bot stakes never touch the bankroll. */
  readonly betMultiplier: number;
  /**
   * Chance of standing on a stiff hard 12-16 that basic strategy says to hit.
   * The "I've got a feeling the next one busts me" instinct.
   */
  readonly stiffStandChance: number;
  /**
   * Chance of doubling a two-card 9, 10 or 11 that basic strategy says only to
   * hit — pressing an edge that is real but not big enough to justify it.
   */
  readonly extraDoubleChance: number;
}

export const BOT_PROFILES: Record<BotProfileId, BotProfile> = {
  'conservative-math': {
    id: 'conservative-math',
    name: 'Conservative Math AI',
    description:
      'Plays basic strategy exactly, every hand, with no exceptions and a flat bet. It consumes no randomness at all, so its decisions depend only on the cards — which is what makes it the baseline the other bot is read against.',
    betMultiplier: 1,
    stiffStandChance: 0,
    extraDoubleChance: 0,
  },

  'aggressive-high-roller': {
    id: 'aggressive-high-roller',
    name: 'Aggressive High-Roller',
    description:
      'Bets five times the table minimum and plays on instinct at the margins: it will sometimes stand on a stiff 12 to 16 rather than risk the bust, and will sometimes double a 9, 10 or 11 that the chart says to merely hit. It never deviates on a pat hand — it chases variance, it does not throw hands away.',
    betMultiplier: 5,
    stiffStandChance: 0.4,
    extraDoubleChance: 0.35,
  },
};

export function profileFor(id: BotProfileId): BotProfile {
  return BOT_PROFILES[id];
}
