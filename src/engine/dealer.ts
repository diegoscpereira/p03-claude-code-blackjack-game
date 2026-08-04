import { draw } from './shoe';
import { handTotal, isBust } from './hand';
import type { Hand, HouseRules, RoundState } from './types';

/**
 * T035 — dealer play (FR-012).
 *
 * The dealer draws to a hard 17 and hits soft 17 under these house rules. That
 * single flag is worth roughly 0.2% of house edge and moves several cells of
 * the strategy chart, which is why it is configuration rather than a constant.
 */
export function playDealer(state: RoundState, rules: HouseRules): RoundState {
  if (state.phase !== 'dealer' && state.phase !== 'bots') return state;

  const revealed: RoundState = { ...state, dealerHoleCardRevealed: true, phase: 'settled' };

  // US1 acceptance 2: with every player hand busted there is nothing to beat,
  // so the dealer reveals but does not draw.
  if (!anyPlayerHandLive(state)) return revealed;

  let shoe = revealed.shoe;
  let cards = [...revealed.dealerHand.cards];

  while (shouldHit(cards, rules)) {
    const { card, shoe: rest } = draw(shoe);
    if (!card) break;
    cards = [...cards, card];
    shoe = rest;
  }

  const dealerHand: Hand = {
    ...revealed.dealerHand,
    cards,
    status: isBust(cards) ? 'busted' : 'stood',
  };

  return { ...revealed, shoe, dealerHand };
}

/** FR-012: draw below 17, and on soft 17 when the rules say so. */
function shouldHit(cards: readonly Hand['cards'][number][], rules: HouseRules): boolean {
  const { total, isSoft } = handTotal(cards);
  if (total < 17) return true;
  return total === 17 && isSoft && rules.dealerHitsSoft17;
}

function anyPlayerHandLive(state: RoundState): boolean {
  return state.playerHands.some((hand) => hand.status !== 'busted');
}
