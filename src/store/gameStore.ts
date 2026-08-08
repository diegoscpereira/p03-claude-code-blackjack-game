import { create } from 'zustand';
import { applyAction, startRound } from '../engine/round';
import { playDealer } from '../engine/dealer';
import { settle } from '../engine/settle';
import { legalActions } from '../engine/rules';
import { DEFAULT_BET, PHASE_1_RULES, STARTING_BANKROLL } from '../engine/rules-config';
import { nextSeed } from './seeds';
import { createRng } from '../engine/rng';
import { playBots } from '../bots/playBots';
import { BOT_PROFILES, BOT_TURN_MS } from '../bots/profiles';
import type { BotSeatConfig } from '../engine/types';
import {
  readTutorialState,
  writeTutorialState,
  type TutorialState,
} from '../ui/tutorial/tutorialState';
import { handTotal } from '../engine/hand';
import { evDifference, rankActions, recommend } from '../strategy/ev';
import { upcardKey } from '../strategy/shape';
import { applySettlement, initialProgression, progressionActions } from './progression';
import type { ProgressionState } from './progression';
import type { Action, Card, Decision, Rank, RoundState, SettledRound } from '../engine/types';
import type { RankedAction } from '../strategy/ev';

/**
 * T037 — the client store.
 *
 * The store owns everything the engine deliberately does not: the bankroll
 * across rounds, the carried shoe, the clock, and the seed. The engine stays
 * pure; this is where impurity is allowed to live, and it is the only layer
 * that touches both.
 *
 * Nothing here awaits anything. Constitution Principle IV: no interactive path
 * may await the network, and the engine call is synchronous by construction.
 */

const rules = PHASE_1_RULES;

export interface GameState extends ProgressionState {
  bankroll: number;
  bet: number;
  bankrollResets: number;
  round: RoundState | null;
  lastSettled: SettledRound | null;
  /** Carried between rounds so the shoe depletes rather than resetting (FR-016). */
  carriedShoe: readonly Card[] | null;
  carriedShoeSize: number;

  tutorial: TutorialState;
  /** Whether the tutorial surface is currently open (not persisted). */
  tutorialOpen: boolean;

  /** FR-026: hides advice without stopping the match data being recorded. */
  companionEnabled: boolean;
  /** The most recent player decision, for the companion's feedback line. */
  lastDecision: Decision | null;
  /** How much EV the last decision gave up, if it was not the recommendation. */
  lastEvGiveUp: number | null;
  /** FR-024a: the two counters the EV accuracy score is derived from. */
  decisionsTaken: number;
  decisionsMatched: number;

  rankedActions: () => RankedAction[];
  recommendation: () => Action | null;
  setCompanionEnabled: (enabled: boolean) => void;

  /** How many bot actions have been revealed so far this round (FR-033). */
  botActionsRevealed: number;
  /** FR-034: true while bot turns are still being shown. */
  controlsLocked: () => boolean;
  /** FR-036: reveal every remaining bot action at once. */
  collapseBotTurns: () => void;

  setBet: (amount: number) => void;
  deal: (seed?: number) => void;
  act: (action: Action) => void;
  legalActions: () => Action[];
  canResetBankroll: () => boolean;
  resetBankroll: () => void;
  dismissTutorial: () => void;
  openTutorial: () => void;
  completeTutorial: () => void;
  setTutorialStep: (step: number) => void;
  reset: () => void;
}

type Set = (partial: Partial<GameState>) => void;
type Get = () => GameState;

const initialState = () => ({
  ...initialProgression(),
  bankroll: STARTING_BANKROLL,
  bet: DEFAULT_BET,
  bankrollResets: 0,
  round: null,
  lastSettled: null,
  carriedShoe: null,
  carriedShoeSize: 0,
  tutorial: readTutorialState(),
  tutorialOpen: false,
  companionEnabled: true,
  lastDecision: null,
  lastEvGiveUp: null,
  decisionsTaken: 0,
  decisionsMatched: 0,
  botActionsRevealed: 0,
});

/** The two bots seated at every table (spec Assumption 5). */
function botSeatsFor(bet: number): BotSeatConfig[] {
  return Object.values(BOT_PROFILES).map((profile, index) => ({
    id: `b${index + 1}`,
    name: profile.name,
    profileId: profile.id,
    bet: bet * profile.betMultiplier,
  }));
}

/**
 * A seed for a round. Randomness is fine *here* — this is the store, not the
 * engine — and the seed it produces is what makes the round reproducible
 * afterwards. `?seed=` pins it; tests and the tutorial pass their own instead.
 */
const freshSeed = (): number => nextSeed();

/**
 * Runs the dealer, settles, and applies everything the settlement implies.
 *
 * Every step is synchronous. The bankroll moves, then progression is applied
 * optimistically, then the records are queued — and only after all of that does
 * anything touch the network, on a timer, in another module (FR-060, FR-061).
 */
function finishRound(set: Set, get: Get, state: RoundState): void {
  const played = playDealer(state, rules);
  const settled = settle(played, rules);

  set({
    round: played,
    lastSettled: settled,
    bankroll: get().bankroll + settled.totalNetChange,
    carriedShoe: played.shoe,
    carriedShoeSize: played.shoeSize,
  });

  // T106 — FR-052: XP, counters, and the outbox enqueue, applied after the
  // bankroll so the snapshot queued is the settled one.
  applySettlement(set, get, settled);
}

function roundActions(set: Set, get: Get) {
  const finish = (state: RoundState): void => finishRound(set, get, state);

  return {
    deal: (seed?: number): void => {
      const { round, bankroll, bet, carriedShoe, carriedShoeSize } = get();
      // FR-015: a second deal while a hand is live is ignored, not queued.
      if (round && round.phase !== 'settled') return;
      if (bankroll < bet) return;

      const roundSeed = seed ?? freshSeed();
      const dealt = startRound({
        seed: roundSeed,
        bet,
        rules,
        bankroll,
        botSeats: botSeatsFor(bet),
        shoe: carriedShoe ?? undefined,
        shoeSize: carriedShoeSize || undefined,
      });

      // FR-037: bot turns resolve *now*, in full. Everything after this is
      // presentation — which is precisely why skipping it cannot change an
      // outcome. A separate seed keeps bot randomness from perturbing the shoe.
      const next =
        dealt.phase === 'bots' ? playBots(dealt, rules, createRng(roundSeed ^ 0x5eed)) : dealt;

      set({ round: next, lastSettled: null, botActionsRevealed: 0 });
      startRevealTimer(set, get);

      // A natural resolves without the player acting (US1 acceptance 3).
      if (next.phase !== 'player') finish(next);
    },

    act: (action: Action): void => {
      const { round } = get();
      if (!round) return;

      // FR-036: input arriving while bot turns are still being shown collapses
      // them and is *consumed by that skip*, never applied to the player's own
      // hand. Without this a keypress meant to skip would silently hit.
      if (botTurnsPending(get())) {
        get().collapseBotTurns();
        return;
      }

      // Snapshot the advice *before* the action changes the state.
      const decision = describeDecision(round, action);
      const giveUp = evDifference(round, rules, action);

      const next = applyAction(round, action, rules);
      // The engine returns the same reference for an illegal action (FR-015),
      // so this is the double-click guard — no separate UI lock needed.
      if (next === round) return;

      if (decision) recordDecision(set, get, decision, giveUp);

      if (next.phase === 'player') set({ round: next });
      else finish(next);
    },

  };
}

/** How many bot actions this round produced, in total. */
function botActionCount(state: GameState): number {
  return state.round?.actionLog.filter((entry) => entry.botId !== undefined).length ?? 0;
}

function botTurnsPending(state: GameState): boolean {
  return state.botActionsRevealed < botActionCount(state);
}

/**
 * T087 — the 600ms turn window (FR-033).
 *
 * A cancellable timer that advances a *counter*, nothing more. The engine has
 * already resolved every bot turn, so this reveals history rather than making
 * it — which is what constitution Principle IV means by pacing being excluded
 * from the response budget while remaining interruptible.
 */
let revealTimer: ReturnType<typeof setTimeout> | null = null;

function clearRevealTimer(): void {
  if (revealTimer !== null) {
    clearTimeout(revealTimer);
    revealTimer = null;
  }
}

function startRevealTimer(set: Set, get: Get): void {
  clearRevealTimer();
  if (!botTurnsPending(get())) return;

  revealTimer = setTimeout(() => {
    set({ botActionsRevealed: get().botActionsRevealed + 1 });
    revealTimer = null;
    startRevealTimer(set, get);
  }, BOT_TURN_MS);
}

function botActions(set: Set, get: Get) {
  return {
    /** FR-034: the player's controls stay disabled while a bot is acting. */
    controlsLocked: (): boolean => botTurnsPending(get()),

    /** FR-036: resolve every remaining bot turn immediately. */
    collapseBotTurns: (): void => {
      if (!botTurnsPending(get())) return;
      clearRevealTimer();
      set({ botActionsRevealed: botActionCount(get()) });
    },
  };
}

/** Derived views over the current round. No state of their own. */
function selectors(get: Get) {
  return {
    legalActions: (): Action[] => {
      const { round } = get();
      return round ? legalActions(round, rules) : [];
    },

    rankedActions: (): RankedAction[] => {
      const { round } = get();
      return round ? rankActions(round, rules) : [];
    },

    recommendation: (): Action | null => {
      const { round } = get();
      return round ? recommend(round, rules) : null;
    },
  };
}

/**
 * T076 — FR-024, FR-024a: what the player chose against what was advised.
 *
 * Returns null for anything the player did not actively choose. The engine's
 * forced split-Ace stand never reaches `act`, so the exclusion FR-024a requires
 * is structural, but a state with no hand to act on is guarded here.
 */
function describeDecision(round: RoundState, chosen: Action): Decision | null {
  const hand = round.playerHands[round.activeHandIndex];
  const upcard = round.dealerHand.cards[0];
  if (!hand || !upcard) return null;

  const advised = recommend(round, rules);
  if (!advised) return null;

  const { total, isSoft } = handTotal(hand.cards);
  return {
    handId: hand.id,
    playerTotal: total,
    isSoft,
    dealerUpcard: upcardKey(upcard.rank) as Rank,
    chosen,
    recommended: advised,
    matched: chosen === advised,
  };
}

/**
 * FR-024a: counts every decision the player made, *including* ones made while
 * the companion was hidden (FR-026). Hiding the advice changes what is shown,
 * never what is scored — otherwise the accuracy figure would quietly reward
 * turning the companion off.
 */
function recordDecision(set: Set, get: Get, decision: Decision, giveUp: number | null): void {
  set({
    lastDecision: decision,
    lastEvGiveUp: decision.matched ? null : giveUp,
    decisionsTaken: get().decisionsTaken + 1,
    decisionsMatched: get().decisionsMatched + (decision.matched ? 1 : 0),
  });
}

function bankrollActions(set: Set, get: Get) {
  return {
    setBet: (amount: number): void => {
      const { bankroll, round } = get();
      // Changing the bet mid-hand would desynchronise the hand's own bet.
      if (round && round.phase !== 'settled') return;
      set({ bet: Math.max(1, Math.min(Math.floor(amount), bankroll))  });
    },

    /** FR-055: offered only once the player genuinely cannot bet. */
    canResetBankroll: (): boolean => get().bankroll <= 0,

    resetBankroll: (): void => {
      if (!get().canResetBankroll()) return;
      // The reset is counted so lifetime statistics stay honest (FR-055).
      set({
        bankroll: STARTING_BANKROLL,
        bet: DEFAULT_BET,
        bankrollResets: get().bankrollResets + 1,
      });
    },

    /** FR-026: hides the advice; the match data keeps being recorded. */
    setCompanionEnabled: (enabled: boolean): void => set({ companionEnabled: enabled }),

    reset: (): void => {
      clearRevealTimer();
      set(initialState());
    },
  };
}

function tutorialActions(set: Set, get: Get) {
  return {
    /**
     * FR-042: exits to the live table immediately — no confirmation, no
     * intermediate screen. The write happens now rather than on unmount, so a
     * player who dismisses and instantly closes the tab still gets FR-043.
     */
    dismissTutorial: (): void => {
      set({ tutorial: writeTutorialState({ dismissed: true }), tutorialOpen: false });
    },

    openTutorial: (): void => set({ tutorialOpen: true }),

    completeTutorial: (): void => {
      set({ tutorial: writeTutorialState({ completed: true }), tutorialOpen: false });
    },

    /** FR-046: remembers the last completed step for a later resume. */
    setTutorialStep: (step: number): void => {
      set({ tutorial: writeTutorialState({ lastStep: Math.max(step, get().tutorial.lastStep) }) });
    },
  };
}

export const useGameStore = create<GameState>()((set, get) => ({
  ...initialState(),
  ...roundActions(set, get),
  ...botActions(set, get),
  ...selectors(get),
  ...bankrollActions(set, get),
  ...tutorialActions(set, get),
  ...progressionActions(set, get),
}));
