import { isPair } from '../../engine/hand';
import type { Action, HouseRules, RoundState } from '../../engine/types';

/**
 * Why an action is unavailable.
 *
 * Constitution Principle III: an illegal action must be "absent or disabled
 * with a stated reason, never offered and then rejected". `legalActions` gives
 * the engine's verdict; this gives the player the sentence explaining it.
 *
 * This lives in the UI layer because it is copy, not rules — but it reads the
 * same state the engine does, so the two cannot disagree about *why*.
 */
export function disabledReason(
  action: Action,
  state: RoundState | null,
  rules: HouseRules,
): string | null {
  if (!state || state.phase !== 'player') return 'Wait for the next hand';

  const hand = state.playerHands[state.activeHandIndex];
  if (!hand) return 'No hand is being played';
  if (hand.isSplitAce) return 'A split Ace takes one card and stands';
  if (hand.status !== 'active') return 'This hand is already resolved';

  switch (action) {
    case 'double':
      return doubleReason(hand, state, rules);
    case 'split':
      return splitReason(hand, state, rules);
    default:
      return null;
  }
}

type Hand = RoundState['playerHands'][number];

function doubleReason(hand: Hand, state: RoundState, rules: HouseRules): string | null {
  if (hand.cards.length !== 2) return 'Double is only available on your first two cards';
  if (hand.isSplitChild && !rules.doubleAfterSplit) return 'Doubling after a split is not allowed';
  if (state.availableBankroll < hand.bet) return `Doubling needs another ${hand.bet} chips`;
  return null;
}

function splitReason(hand: Hand, state: RoundState, rules: HouseRules): string | null {
  if (!isPair(hand.cards)) return 'Split needs a matching pair';
  if (state.playerHands.length >= rules.maxHands) {
    return `You already have the maximum of ${rules.maxHands} hands`;
  }
  if (state.availableBankroll < hand.bet) return `Splitting needs another ${hand.bet} chips`;
  return null;
}

/** The keyboard shortcut for each action (NFR-008). */
export const ACTION_KEYS: Record<Exclude<Action, 'surrender'>, string> = {
  hit: 'h',
  stand: 's',
  double: 'd',
  split: 'p',
};

export const ACTION_LABELS: Record<Exclude<Action, 'surrender'>, string> = {
  hit: 'Hit',
  stand: 'Stand',
  double: 'Double',
  split: 'Split',
};
