import type {
  BotSeat,
  Card,
  Hand,
  HandStatus,
  Phase,
  Rank,
  RoundState,
  Suit,
} from '../../src/engine/types';
import { STARTING_BANKROLL } from '../../src/engine/rules-config';

/**
 * T018 — fixtures from shorthand.
 *
 * `hand('A,6')` reads as the thing being tested; a four-line object literal of
 * `{ rank, suit }` pairs does not. Every engine test that needs a specific hand
 * shape goes through here, so the shape of `Hand` can change in one place.
 */

const RANKS = new Set<string>([
  'A',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  'J',
  'Q',
  'K',
]);

const SUITS: Suit[] = ['♠', '♥', '♦', '♣'];

/** `'A,6'` or `'A 6'` or `'A-6'` → cards. Suits rotate; no rule depends on them. */
export function cards(shorthand: string): Card[] {
  if (shorthand.trim() === '') return [];
  return shorthand
    .split(/[\s,-]+/)
    .filter((token) => token !== '')
    .map((token, index) => {
      const rank = token.toUpperCase();
      if (!RANKS.has(rank)) {
        throw new Error(`Unknown rank '${token}' in shorthand '${shorthand}'`);
      }
      return { rank: rank as Rank, suit: SUITS[index % SUITS.length] as Suit };
    });
}

/** A single card, for stacking a shoe: `card('10')`. */
export function card(rank: string, suit: Suit = '♠'): Card {
  const upper = rank.toUpperCase();
  if (!RANKS.has(upper)) throw new Error(`Unknown rank '${rank}'`);
  return { rank: upper as Rank, suit };
}

export interface HandOverrides {
  id?: string;
  bet?: number;
  status?: HandStatus;
  isSplitChild?: boolean;
  isSplitAce?: boolean;
  doubled?: boolean;
}

export function hand(shorthand: string, overrides: HandOverrides = {}): Hand {
  return {
    id: overrides.id ?? 'h1',
    cards: cards(shorthand),
    bet: overrides.bet ?? 10,
    status: overrides.status ?? 'active',
    isSplitChild: overrides.isSplitChild ?? false,
    isSplitAce: overrides.isSplitAce ?? false,
    doubled: overrides.doubled ?? false,
  };
}

/**
 * A shoe that deals the given cards in order.
 *
 * The engine draws from the *end* of the shoe array (a pop, not a shift, so a
 * draw is O(1)), so the shorthand is reversed here. Tests can therefore write
 * the order cards will actually appear.
 */
export function stackedShoe(shorthand: string): Card[] {
  return cards(shorthand).reverse();
}

export interface RoundOverrides {
  seed?: number;
  shoe?: Card[];
  shoeSize?: number;
  playerHands?: Hand[];
  activeHandIndex?: number;
  dealerHand?: Hand;
  dealerHoleCardRevealed?: boolean;
  botSeats?: BotSeat[];
  phase?: Phase;
  availableBankroll?: number;
}

/**
 * A round mid-play. Defaults put the player on a single active hand against a
 * dealer showing a 10, in the `player` phase — the state most rules tests want.
 */
export function round(overrides: RoundOverrides = {}): RoundState {
  const playerHands = overrides.playerHands ?? [hand('10,6')];
  const shoe = overrides.shoe ?? stackedShoe('5,5,5,5,5,5,5,5,5,5');
  return {
    seed: overrides.seed ?? 1,
    shoe,
    shoeSize: overrides.shoeSize ?? shoe.length,
    playerHands,
    activeHandIndex: overrides.activeHandIndex ?? 0,
    dealerHand: overrides.dealerHand ?? hand('10,7', { id: 'dealer' }),
    dealerHoleCardRevealed: overrides.dealerHoleCardRevealed ?? false,
    botSeats: overrides.botSeats ?? [],
    phase: overrides.phase ?? 'player',
    decisions: [],
    actionLog: [],
    availableBankroll: overrides.availableBankroll ?? STARTING_BANKROLL,
  };
}

/** `'A,6'`-style shorthand for what a hand currently holds — for assertions. */
export function describeCards(list: readonly Card[]): string {
  return list.map((c) => c.rank).join(',');
}
