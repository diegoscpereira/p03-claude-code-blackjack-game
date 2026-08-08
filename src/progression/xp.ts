import type { Decision } from '../engine/types';

/**
 * T098 — FR-050: what a hand is worth.
 *
 * Ten XP for turning up, two more for each decision that matched the
 * recommendation. There is deliberately no outcome parameter: XP that tracked
 * winning would reward variance, and the ladder is meant to measure play
 * quality. A player who follows the chart and loses six hands in a row has
 * played well, and the progression should say so.
 */

export const XP_PER_HAND = 10;
export const XP_PER_MATCHED_DECISION = 2;

/** The XP a settled hand awards, given the decisions the player took in it. */
export function xpForHand(decisions: readonly Decision[]): number {
  const matched = decisions.filter((decision) => decision.matched).length;
  return XP_PER_HAND + matched * XP_PER_MATCHED_DECISION;
}
