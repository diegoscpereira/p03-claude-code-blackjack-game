import { create } from 'zustand';
import { applyAction, startRound } from '../engine/round';
import { playDealer } from '../engine/dealer';
import { settle } from '../engine/settle';
import { legalActions } from '../engine/rules';
import { DEFAULT_BET, PHASE_1_RULES, STARTING_BANKROLL } from '../engine/rules-config';
import { nextSeed } from './seeds';
import type { Action, Card, RoundState, SettledRound } from '../engine/types';

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

export interface GameState {
  bankroll: number;
  bet: number;
  bankrollResets: number;
  round: RoundState | null;
  lastSettled: SettledRound | null;
  /** Carried between rounds so the shoe depletes rather than resetting (FR-016). */
  carriedShoe: readonly Card[] | null;
  carriedShoeSize: number;

  setBet: (amount: number) => void;
  deal: (seed?: number) => void;
  act: (action: Action) => void;
  legalActions: () => Action[];
  canResetBankroll: () => boolean;
  resetBankroll: () => void;
  reset: () => void;
}

type Set = (partial: Partial<GameState>) => void;
type Get = () => GameState;

const initialState = () => ({
  bankroll: STARTING_BANKROLL,
  bet: DEFAULT_BET,
  bankrollResets: 0,
  round: null,
  lastSettled: null,
  carriedShoe: null,
  carriedShoeSize: 0,
});

/**
 * A seed for a round. Randomness is fine *here* — this is the store, not the
 * engine — and the seed it produces is what makes the round reproducible
 * afterwards. `?seed=` pins it; tests and the tutorial pass their own instead.
 */
const freshSeed = (): number => nextSeed();

function roundActions(set: Set, get: Get) {
  /** Runs the dealer and settles, applying the result to the bankroll once. */
  const finish = (state: RoundState): void => {
    const played = playDealer(state, rules);
    const settled = settle(played, rules);
    set({
      round: played,
      lastSettled: settled,
      bankroll: get().bankroll + settled.totalNetChange,
      carriedShoe: played.shoe,
      carriedShoeSize: played.shoeSize,
    });
  };

  return {
    deal: (seed?: number): void => {
      const { round, bankroll, bet, carriedShoe, carriedShoeSize } = get();
      // FR-015: a second deal while a hand is live is ignored, not queued.
      if (round && round.phase !== 'settled') return;
      if (bankroll < bet) return;

      const next = startRound({
        seed: seed ?? freshSeed(),
        bet,
        rules,
        bankroll,
        shoe: carriedShoe ?? undefined,
        shoeSize: carriedShoeSize || undefined,
      });

      set({ round: next, lastSettled: null });
      // A natural resolves without the player acting (US1 acceptance 3).
      if (next.phase !== 'player') finish(next);
    },

    act: (action: Action): void => {
      const { round } = get();
      if (!round) return;

      const next = applyAction(round, action, rules);
      // The engine returns the same reference for an illegal action (FR-015),
      // so this is the double-click guard — no separate UI lock needed.
      if (next === round) return;

      if (next.phase === 'player') set({ round: next });
      else finish(next);
    },

    legalActions: (): Action[] => {
      const { round } = get();
      return round ? legalActions(round, rules) : [];
    },
  };
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

    reset: (): void => set(initialState()),
  };
}

export const useGameStore = create<GameState>()((set, get) => ({
  ...initialState(),
  ...roundActions(set, get),
  ...bankrollActions(set, get),
}));
