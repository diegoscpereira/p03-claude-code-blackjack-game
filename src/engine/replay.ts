import { startRound, applyAction } from './round';
import { playDealer } from './dealer';
import { settle } from './settle';
import type {
  ActionRecord,
  BotSeat,
  BotSeatConfig,
  Card,
  HandLogRecord,
  HouseRules,
  RoundState,
  SettledRound,
} from './types';

/**
 * T115 — replaying a recorded hand (FR-014, FR-067, SC-008).
 *
 * SC-008 is the claim User Story 7 asks this repository to make good on: *"A
 * reviewer can reproduce any recorded hand's exact outcome from its seed and
 * action list."* This module is where that claim is either true or marketing.
 *
 * It is only possible because of two earlier decisions. Randomness enters the
 * engine through an injected `Rng` seeded once per round (R2), and — the part
 * that does the real work — `applyAction` consumes no randomness at all. Every
 * transition after the shuffle is a pure function of the state, so the seed
 * fixes the entire shoe and the action list fixes everything drawn from it.
 *
 * Note what this module does *not* import: `src/bots`. Bot turns are replayed
 * from the log rather than re-decided, which keeps the engine free of the
 * strategy layer (Principle I) and makes replay independent of whether a bot's
 * policy has since changed. A recorded hand replays to what happened, not to
 * what today's bot would do.
 */

export interface ReplayOptions {
  readonly seed: number;
  /** The round's ordered action log, player and bot entries alike. */
  readonly actions: readonly ActionRecord[];
  readonly rules: HouseRules;
  readonly bet: number;
  /**
   * Defaulted generously: the record is proof that every action in it was
   * affordable when it was taken, so a replay has no reason to re-litigate
   * affordability. It changes no card and no outcome.
   */
  readonly bankroll?: number;
  /**
   * Seats present when the hand was dealt. Required for an exact replay because
   * bots are dealt from the same shoe — a hand log alone cannot know they were
   * there, which is why the caller supplies them.
   */
  readonly botSeats?: readonly BotSeatConfig[];
}

export interface ReplayResult {
  readonly state: RoundState;
  readonly settled: SettledRound;
}

/** Rebuilds a round from its seed and action list. */
export function replayRound(options: ReplayOptions): ReplayResult {
  const { seed, rules, bet, actions, botSeats = [] } = options;

  const dealt = startRound({
    seed,
    bet,
    rules,
    bankroll: options.bankroll ?? Number.MAX_SAFE_INTEGER,
    botSeats,
  });

  const state = replayPlayer(replayBots(dealt, actions, rules), actions, rules);
  const played = playDealer(state, rules);

  return { state: played, settled: settle(played, rules) };
}

/**
 * The reviewer's actual starting point: a stored `hand_logs` row and nothing
 * else. The bet is not on the record — the per-hand stake is derivable from
 * `net_change` only for some outcomes — so it is passed in.
 */
export function replayHandLog(
  log: HandLogRecord,
  options: Omit<ReplayOptions, 'seed' | 'actions'>,
): ReplayResult {
  return replayRound({ ...options, seed: log.seed, actions: log.actions });
}

/** Player entries only, in order, stopping when the round leaves their turn. */
function replayPlayer(
  state: RoundState,
  actions: readonly ActionRecord[],
  rules: HouseRules,
): RoundState {
  let current = state;

  for (const entry of actions) {
    // Bot turns are handled separately, and automatic actions — the forced
    // split-Ace stand — are the engine's own doing. Re-applying one would
    // consume a turn the player never took (FR-011, FR-024a).
    if (entry.botId !== undefined || entry.automatic === true) continue;
    if (current.phase !== 'player') break;

    // The reducer is total (FR-015): an action the rules now refuse returns the
    // same state rather than throwing, so a stale log degrades instead of
    // crashing the analysis view that opened it.
    current = applyAction(current, entry.action, rules);
  }

  return current;
}

/**
 * Replays the bot seats, in seating order, before the player acts.
 *
 * The order matters and is not cosmetic: bots draw from the same shoe, so a
 * replay that skipped their turns — or took them in a different order — would
 * deal the player different cards from the third card onward.
 */
function replayBots(
  state: RoundState,
  actions: readonly ActionRecord[],
  rules: HouseRules,
): RoundState {
  if (state.phase !== 'bots') return state;
  if (state.botSeats.length === 0) return { ...state, phase: 'player' };

  let shoe = state.shoe;
  const seats = state.botSeats.map((seat) => {
    const replayed = replaySeat(seat, shoe, rules, actionsFor(actions, seat.id));
    shoe = replayed.shoe;
    return replayed.seat;
  });

  return { ...state, botSeats: seats, shoe, phase: 'player' };
}

const actionsFor = (actions: readonly ActionRecord[], botId: string): ActionRecord[] =>
  actions.filter((entry) => entry.botId === botId);

/**
 * Plays one seat from its logged actions, using the same trick `playBots` uses:
 * the seat's hand is presented to the reducer as the active player hand, so a
 * bot is bound by exactly the rules a player is. Their settlement is never
 * computed — FR-035 keeps bot outcomes away from the player's bankroll, and the
 * strongest guarantee of that is that no code totals them.
 */
function replaySeat(
  seat: BotSeat,
  shoe: readonly Card[],
  rules: HouseRules,
  logged: readonly ActionRecord[],
): { seat: BotSeat; shoe: readonly Card[] } {
  let view: RoundState = {
    seed: 0,
    shoe,
    shoeSize: 0,
    playerHands: [seat.hand],
    activeHandIndex: 0,
    dealerHand: {
      id: 'dealer',
      cards: [],
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
    availableBankroll: Number.MAX_SAFE_INTEGER,
  };

  for (const entry of logged) {
    if (view.phase !== 'player') break;
    view = applyAction(view, entry.action, rules);
  }

  return { seat: { ...seat, hand: view.playerHands[0] as BotSeat['hand'] }, shoe: view.shoe };
}
