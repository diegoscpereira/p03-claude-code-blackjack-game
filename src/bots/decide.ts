import { handTotal } from '../engine/hand';
import { legalActions } from '../engine/rules';
import { recommend } from '../strategy/ev';
import { profileFor } from './profiles';
import type { Action, BotProfileId, HouseRules, Rng, RoundState } from '../engine/types';

/**
 * T084 — a bot's decision (FR-030, FR-031).
 *
 * Pure, and reproducible from the injected `Rng`. Basic strategy is the
 * baseline for both profiles; a profile's personality is expressed entirely as
 * licensed departures from it, which is what keeps the Conservative bot's claim
 * — "plays the chart exactly" — checkable rather than aspirational.
 *
 * The state passed here has the bot's own hand in `playerHands[activeHandIndex]`
 * — the caller substitutes the seat before asking, so the same rules and the
 * same strategy lookup serve bots and the player alike. A bot playing by
 * different rules than the table would teach the wrong lesson.
 */
export function decide(
  profileId: BotProfileId,
  state: RoundState,
  rules: HouseRules,
  rng: Rng,
): Action {
  const legal = legalActions(state, rules);
  if (legal.length === 0) return 'stand';

  const baseline = recommend(state, rules) ?? 'stand';
  const profile = profileFor(profileId);

  // The Conservative Math AI consumes no randomness at all, so seeding cannot
  // change it and the profile test can assert exactly that.
  if (profile.stiffStandChance === 0 && profile.extraDoubleChance === 0) return baseline;

  const hand = state.playerHands[state.activeHandIndex];
  if (!hand) return baseline;
  const { total, isSoft } = handTotal(hand.cards);

  // Deviation 1: stand on a stiff hand the chart says to hit.
  if (baseline === 'hit' && !isSoft && total >= 12 && total <= 16 && legal.includes('stand')) {
    if (rng.next() < profile.stiffStandChance) return 'stand';
    return baseline;
  }

  // Deviation 2: double a two-card 9-11 the chart says only to hit.
  if (baseline === 'hit' && !isSoft && total >= 9 && total <= 11 && legal.includes('double')) {
    if (rng.next() < profile.extraDoubleChance) return 'double';
    return baseline;
  }

  // Everywhere else — pat hands, soft hands, splits — it plays the chart. It
  // chases variance; it does not throw hands away.
  return baseline;
}
