import { isPair } from './hand';
import type { Action, Hand, HouseRules, RoundState } from './types';

/**
 * T033 — the legal action set (FR-002, FR-010).
 *
 * contracts/engine-api.md makes this authoritative: the UI renders exactly this
 * set and nothing else. If an action is absent here, no path in the UI may
 * offer it — which is how Principle III's "never offered and then rejected"
 * becomes a property of the engine rather than a UI convention.
 */
export function legalActions(state: RoundState, rules: HouseRules): Action[] {
  if (state.phase !== 'player') return [];

  const hand = state.playerHands[state.activeHandIndex];
  if (!hand || !isActionable(hand)) return [];

  const actions: Action[] = ['hit', 'stand'];

  if (canDouble(hand, state, rules)) actions.push('double');
  if (canSplit(hand, state, rules)) actions.push('split');
  if (rules.surrenderAllowed && hand.cards.length === 2 && !hand.isSplitChild) {
    actions.push('surrender');
  }

  return actions;
}

/**
 * A split-Ace hand is never actionable: FR-011 stands it automatically the
 * moment it receives its one card, so there is no decision point to offer.
 */
function isActionable(hand: Hand): boolean {
  return hand.status === 'active' && !hand.isSplitAce && !hand.doubled;
}

/** FR-008, and the spec edge case that Double is withheld rather than rejected. */
function canDouble(hand: Hand, state: RoundState, rules: HouseRules): boolean {
  if (hand.cards.length !== 2) return false;
  if (hand.isSplitChild && !rules.doubleAfterSplit) return false;
  return state.availableBankroll >= hand.bet;
}

/** FR-009, FR-010: a pair, room under the hand cap, and chips for the second bet. */
function canSplit(hand: Hand, state: RoundState, rules: HouseRules): boolean {
  if (!isPair(hand.cards)) return false;
  if (state.playerHands.length >= rules.maxHands) return false;
  return state.availableBankroll >= hand.bet;
}
