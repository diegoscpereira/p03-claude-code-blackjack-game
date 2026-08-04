import { applyAction } from '../engine/round';
import { decide } from './decide';
import type { ActionRecord, BotSeat, HouseRules, Rng, RoundState } from '../engine/types';

/**
 * T085 — resolving the bot seats (FR-030, FR-035, FR-037).
 *
 * Lives in `src/bots` rather than `src/engine` on purpose. The engine deals the
 * bots their cards and holds their hands, but it must not know how they think —
 * `decide` reaches into `src/strategy`, and an engine that imported strategy
 * would invert the layering the ESLint boundary rule enforces.
 *
 * **FR-037 is the load-bearing property here.** This function resolves every
 * bot turn *immediately and completely*. The 600ms window is applied by the
 * store afterwards, purely to reveal what already happened. That is what makes
 * "skipping it changes no outcome" true by construction rather than by careful
 * timer handling — there is no alternate code path to get wrong.
 */
export function playBots(state: RoundState, rules: HouseRules, rng: Rng): RoundState {
  if (state.phase !== 'bots' || state.botSeats.length === 0) {
    return { ...state, phase: 'player' };
  }

  const seats = [...state.botSeats];
  let shoe = state.shoe;
  const log: ActionRecord[] = [];

  for (let index = 0; index < seats.length; index++) {
    const resolved = playSeat(seats[index] as BotSeat, shoe, rules, rng, log);
    seats[index] = resolved.seat;
    shoe = resolved.shoe;
  }

  // Play passes to the player, whose decision point is what FR-036 calls
  // "the next player decision point".
  return { ...state, botSeats: seats, shoe, phase: 'player', actionLog: [...state.actionLog, ...log] };
}

/**
 * Plays one seat to completion by borrowing the engine's own reducer: the seat's
 * hand is presented as the active player hand, so bots are bound by exactly the
 * rules the player is. Their settlement is never computed — FR-035 keeps bot
 * outcomes away from the player's bankroll, and the simplest way to guarantee
 * that is for no code to ever total them.
 */
function playSeat(
  seat: BotSeat,
  shoe: readonly RoundState['shoe'][number][],
  rules: HouseRules,
  rng: Rng,
  log: ActionRecord[],
): { seat: BotSeat; shoe: readonly RoundState['shoe'][number][] } {
  let view: RoundState = {
    seed: 0,
    shoe,
    shoeSize: 0,
    playerHands: [seat.hand],
    activeHandIndex: 0,
    dealerHand: { id: 'dealer', cards: [], bet: 0, status: 'active', isSplitChild: false, isSplitAce: false, doubled: false },
    dealerHoleCardRevealed: false,
    botSeats: [],
    phase: 'player',
    decisions: [],
    actionLog: [],
    // Bots always cover their own doubles and splits; their stake is notional
    // and never drawn from the player's chips.
    availableBankroll: Number.MAX_SAFE_INTEGER,
  };

  // A bot cannot loop forever: every legal action either draws a card or ends a
  // hand, and the four-hand cap bounds splits. The guard is belt and braces.
  for (let step = 0; step < 24 && view.phase === 'player'; step++) {
    const action = decide(seat.profileId, view, rules, rng);
    const next = applyAction(view, action, rules);
    if (next === view) break;
    log.push({ handId: seat.hand.id, action, botId: seat.id });
    view = next;
  }

  return { seat: { ...seat, hand: view.playerHands[0] as BotSeat['hand'] }, shoe: view.shoe };
}

/** The dealer view of a bot seat, for the UI. */
export function botSeatsOf(state: RoundState): readonly BotSeat[] {
  return state.botSeats;
}
