import { STARTING_BANKROLL, DEFAULT_BET } from '../../engine/rules-config';
import type { Card, Rank, RoundState, Suit } from '../../engine/types';

/**
 * T058 — a round dealt from a script rather than from a seed.
 *
 * Each lesson must deal one predetermined hand. Searching for a seed that
 * happens to produce "a pair of eights against a ten" would be slow, fragile,
 * and would break the moment the shuffle changed — so the lesson states its
 * cards and this builds the state directly.
 *
 * The result is a perfectly ordinary `RoundState`: the same engine functions
 * evaluate it, and the same strategy lookup advises on it. The tutorial gets no
 * special path through the rules.
 */

const SUITS: readonly Suit[] = ['♠', '♥', '♦', '♣'];

function parse(shorthand: string, suitOffset = 0): Card[] {
  return shorthand
    .split(',')
    .map((token) => token.trim())
    .filter((token) => token !== '')
    .map((rank, index) => ({
      rank: rank.toUpperCase() as Rank,
      suit: SUITS[(index + suitOffset) % SUITS.length] as Suit,
    }));
}

/**
 * @param player  Player cards, e.g. `'8,8'`.
 * @param dealer  The dealer's upcard, e.g. `'10'`. A hole card is added so the
 *                board looks exactly like a real deal; it stays hidden, and no
 *                lesson plays far enough to reveal it.
 */
export function scriptedRound(player: string, dealer: string): RoundState {
  const playerCards = parse(player);
  const dealerCards = [...parse(dealer, 1), { rank: '7' as Rank, suit: '♣' as Suit }];

  return {
    seed: 0,
    shoe: [],
    shoeSize: 0,
    playerHands: [
      {
        id: 'lesson',
        cards: playerCards,
        bet: DEFAULT_BET,
        status: 'active',
        isSplitChild: false,
        isSplitAce: false,
        doubled: false,
      },
    ],
    activeHandIndex: 0,
    dealerHand: {
      id: 'dealer',
      cards: dealerCards,
      bet: 0,
      status: 'active',
      isSplitChild: false,
      isSplitAce: false,
      doubled: false,
    },
    dealerHoleCardRevealed: false,
    botSeats: [],
    phase: 'player',
    decisions: [],
    actionLog: [],
    // Ample, so Double and Split are legal wherever a lesson teaches them.
    availableBankroll: STARTING_BANKROLL,
  };
}
