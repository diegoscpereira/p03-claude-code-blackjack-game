import { legalActions } from '../engine/rules';
import { shapeOf, upcardKey } from './shape';
import tables from './data/ev-tables.json';
import type { Action, HouseRules, RoundState } from '../engine/types';

/**
 * T071 — expected values, by lookup (NFR-002).
 *
 * Synchronous, no computation, no await. The whole point of generating the
 * tables at build time (research.md R1) is that this function is a hash lookup:
 * a runtime solver would put a recursive shoe evaluation on a path budgeted at
 * 100ms, and would make determinism something to prove rather than a fact.
 */

type SolvedPoint = Partial<Record<Action, number>>;

const ENTRIES = tables.entries as Record<string, SolvedPoint>;

export interface RankedAction {
  action: Action;
  ev: number;
}

/** The solved values for the hand currently being acted on, or null. */
function pointFor(state: RoundState): SolvedPoint | null {
  const hand = state.playerHands[state.activeHandIndex];
  const upcard = state.dealerHand.cards[0];
  if (!hand || !upcard) return null;
  return ENTRIES[`${shapeOf(hand.cards)}|${upcardKey(upcard.rank)}`] ?? null;
}

/**
 * FR-022: one entry per legal action, sorted by expected value descending.
 *
 * Only legal actions appear. An action the engine will not accept has no
 * business carrying a number in the interface — that is the same rule the
 * controls follow, sourced from the same `legalActions`.
 */
export function rankActions(state: RoundState, rules: HouseRules): RankedAction[] {
  const point = pointFor(state);
  if (!point) return [];

  return legalActions(state, rules)
    .map((action) => ({ action, ev: point[action] }))
    .filter((entry): entry is RankedAction => entry.ev !== undefined)
    .sort((a, b) => b.ev - a.ev);
}

/**
 * FR-021: the highest-EV legal action.
 *
 * Equal to `rankActions(...)[0].action` by construction, which is asserted
 * rather than assumed — the two must never drift apart.
 */
export function recommend(state: RoundState, rules: HouseRules): Action | null {
  return rankActions(state, rules)[0]?.action ?? null;
}

/** FR-025: how much the chosen action gave up against the recommendation. */
export function evDifference(state: RoundState, rules: HouseRules, chosen: Action): number | null {
  const ranked = rankActions(state, rules);
  const best = ranked[0];
  const taken = ranked.find((entry) => entry.action === chosen);
  if (!best || !taken) return null;
  return best.ev - taken.ev;
}
