import type { HouseRules } from './types';

/**
 * T014 — the Phase 1 house rules (spec Assumption 1).
 *
 * These are stated as a constant rather than a setting because the companion's
 * expected values are only verifiable against a *specific* published chart. A
 * player-facing rules editor is explicitly out of scope for Phase 1; the engine
 * accepts any `HouseRules`, so adding one later changes no engine code.
 */
export const PHASE_1_RULES: HouseRules = {
  decks: 6,
  dealerHitsSoft17: true,
  blackjackPays: 1.5,
  maxHands: 4,
  doubleAfterSplit: true,
  surrenderAllowed: false,
  penetration: 0.75,
};

/** Starting play-money bankroll (spec Assumption 3). */
export const STARTING_BANKROLL = 1000;

/** Default wager, and the increment the bet controls step by. */
export const DEFAULT_BET = 10;
