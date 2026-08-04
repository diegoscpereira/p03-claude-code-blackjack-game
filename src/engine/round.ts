import { createRng } from './rng';
import { createShoe, draw, needsReshuffle } from './shoe';
import { handTotal, isBust, isNatural } from './hand';
import { legalActions } from './rules';
import type {
  Action,
  ActionRecord,
  BotSeatConfig,
  Card,
  Hand,
  HouseRules,
  RoundState,
} from './types';

/**
 * T034 — `startRound` and the `applyAction` reducer.
 *
 * **Deviation from contracts/engine-api.md, deliberately.** The contract sketch
 * takes an `Rng` on `applyAction`. It does not need one: the entire round's
 * randomness is consumed by the shuffle in `startRound`, so every subsequent
 * transition is a pure function of the state alone. That is a stronger
 * guarantee than the contract asks for, not a weaker one — there is no way for
 * a mid-round action to consume randomness and desynchronise a replay.
 *
 * `startRound` likewise takes an options object rather than four positional
 * arguments, because it needs the carried-over shoe and the bankroll, and the
 * contract sketch omitted both.
 */

export interface StartRoundOptions {
  seed: number;
  bet: number;
  rules: HouseRules;
  bankroll: number;
  botSeats?: readonly BotSeatConfig[];
  /** Carried from the previous round; rebuilt when absent or past penetration. */
  shoe?: readonly Card[];
  shoeSize?: number;
}

const emptyHand = (id: string, bet: number): Hand => ({
  id,
  cards: [],
  bet,
  status: 'active',
  isSplitChild: false,
  isSplitAce: false,
  doubled: false,
});

/** FR-016: reshuffle between rounds only, and only once penetration is passed. */
function shoeForRound(options: StartRoundOptions): { shoe: readonly Card[]; shoeSize: number } {
  const { shoe, rules, seed } = options;
  // A supplied shoe with no stated original size is treated as freshly built —
  // otherwise a stacked test shoe would look 100% penetrated and be discarded.
  const shoeSize = options.shoeSize ?? shoe?.length ?? 0;
  if (shoe && !needsReshuffle(shoe, shoeSize, rules.penetration)) {
    return { shoe, shoeSize };
  }
  const fresh = createShoe(rules.decks, createRng(seed));
  return { shoe: fresh, shoeSize: fresh.length };
}

function dealCard(shoe: readonly Card[], hand: Hand): { shoe: readonly Card[]; hand: Hand } {
  const { card, shoe: rest } = draw(shoe);
  if (!card) return { shoe, hand };
  return { shoe: rest, hand: { ...hand, cards: [...hand.cards, card] } };
}

/** FR-005: one card to each participant, then a second — dealer's last is the hole card. */
export function startRound(options: StartRoundOptions): RoundState {
  const { seed, bet, bankroll, botSeats = [] } = options;
  const { shoe: initialShoe, shoeSize } = shoeForRound(options);
  let shoe = initialShoe;

  let player = emptyHand('h1', bet);
  let dealer = emptyHand('dealer', 0);
  let bots = botSeats.map((seat) => ({ ...seat, hand: emptyHand(`bot-${seat.id}`, seat.bet) }));

  for (let pass = 0; pass < 2; pass++) {
    ({ shoe, hand: player } = dealCard(shoe, player));
    bots = bots.map((seat) => {
      const dealt = dealCard(shoe, seat.hand);
      shoe = dealt.shoe;
      return { ...seat, hand: dealt.hand };
    });
    ({ shoe, hand: dealer } = dealCard(shoe, dealer));
  }

  // Only the player's bet leaves the player's bankroll. Bot stakes are their
  // own and never touch it (FR-035).
  const state: RoundState = {
    seed,
    shoe,
    shoeSize,
    playerHands: [player],
    activeHandIndex: 0,
    dealerHand: dealer,
    dealerHoleCardRevealed: false,
    botSeats: bots.map(({ id, name, profileId, hand }) => ({ id, name, profileId, hand })),
    phase: 'player',
    decisions: [],
    actionLog: [],
    availableBankroll: bankroll - bet,
  };

  // US1 acceptance 3: a natural resolves without the player acting.
  if (isNatural(player)) {
    return advance({ ...state, playerHands: [{ ...player, status: 'blackjack' }] });
  }
  return state;
}

/**
 * The reducer. Total by contract: an action outside `legalActions` returns the
 * *same reference*, which is what makes FR-015's double-click protection a
 * property of the engine rather than of a UI guard.
 */
export function applyAction(state: RoundState, action: Action, rules: HouseRules): RoundState {
  if (!legalActions(state, rules).includes(action)) return state;

  const hand = state.playerHands[state.activeHandIndex];
  if (!hand) return state;

  const logged = log(state, { handId: hand.id, action });

  switch (action) {
    case 'hit':
      return advance(hit(logged, hand));
    case 'stand':
      return advance(replaceActive(logged, { ...hand, status: 'stood' }));
    case 'double':
      return advance(double(logged, hand));
    case 'split':
      return advance(split(logged, hand));
    case 'surrender':
      // Not offered in Phase 1; `legalActions` has already refused it above.
      return state;
  }
}

function log(state: RoundState, entry: ActionRecord): RoundState {
  return { ...state, actionLog: [...state.actionLog, entry] };
}

function replaceActive(state: RoundState, hand: Hand): RoundState {
  const playerHands = state.playerHands.map((h, i) => (i === state.activeHandIndex ? hand : h));
  return { ...state, playerHands };
}

function hit(state: RoundState, hand: Hand): RoundState {
  const dealt = dealCard(state.shoe, hand);
  const status = isBust(dealt.hand.cards) ? 'busted' : 'active';
  return replaceActive({ ...state, shoe: dealt.shoe }, { ...dealt.hand, status });
}

/** FR-008: double the bet, deal exactly one card, end the hand. */
function double(state: RoundState, hand: Hand): RoundState {
  const dealt = dealCard(state.shoe, hand);
  const status = isBust(dealt.hand.cards) ? 'busted' : 'stood';
  return replaceActive(
    { ...state, shoe: dealt.shoe, availableBankroll: state.availableBankroll - hand.bet },
    { ...dealt.hand, bet: hand.bet * 2, doubled: true, status },
  );
}

/** FR-009, FR-011: two hands, one card each, and Aces stand automatically. */
function split(state: RoundState, hand: Hand): RoundState {
  const [first, second] = hand.cards;
  if (!first || !second) return state;

  const isSplitAce = first.rank === 'A';
  const base = { bet: hand.bet, status: 'active' as const, isSplitChild: true, isSplitAce, doubled: false };
  const suffix = state.playerHands.length;

  let shoe = state.shoe;
  const built: Hand[] = [];
  for (const [index, card] of [first, second].entries()) {
    const dealt = dealCard(shoe, { ...base, id: `${hand.id}-${suffix + index}`, cards: [card] });
    shoe = dealt.shoe;
    built.push(isSplitAce ? { ...dealt.hand, status: 'stood' } : dealt.hand);
  }

  const playerHands = [...state.playerHands];
  playerHands.splice(state.activeHandIndex, 1, ...built);

  const forcedStands: ActionRecord[] = isSplitAce
    ? built.map((h) => ({ handId: h.id, action: 'stand' as const, automatic: true }))
    : [];

  return {
    ...state,
    shoe,
    playerHands,
    availableBankroll: state.availableBankroll - hand.bet,
    actionLog: [...state.actionLog, ...forcedStands],
  };
}

/**
 * Moves to the next unresolved hand, or off the player phase entirely.
 *
 * Split hands are inserted in place, so "the next hand" is found by scanning
 * forward from the current index rather than by incrementing it.
 */
function advance(state: RoundState): RoundState {
  const nextIndex = state.playerHands.findIndex(
    (hand, index) => index >= state.activeHandIndex && hand.status === 'active' && !hand.isSplitAce,
  );

  if (nextIndex !== -1) {
    return { ...state, activeHandIndex: nextIndex, phase: 'player' };
  }

  return {
    ...state,
    activeHandIndex: state.playerHands.length - 1,
    phase: state.botSeats.length > 0 ? 'bots' : 'dealer',
  };
}

/** Convenience for callers that need a hand's total without importing `hand.ts`. */
export function totalOf(hand: Hand): number {
  return handTotal(hand.cards).total;
}
