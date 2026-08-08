import { applyXp } from '../progression/levels';
import type { UnlockId } from '../progression/levels';
import { xpForHand } from '../progression/xp';
import { evAccuracy } from '../progression/accuracy';
import { drainOutbox, enqueueHand, enqueueProgress, pendingCount } from '../sync/outbox';
import { generateUuid, getPlayerId } from '../sync/identity';
import { apiTransport, fetchProgress, startOutboxDrain } from '../sync/client';
import { reconcile } from '../sync/reconcile';
import type { HandRecord, ProgressSnapshot } from '../sync/records';
import type { Outcome, SettledRound } from '../engine/types';
import type { GameState } from './gameStore';

/**
 * T106, T107 — progression and its background replica.
 *
 * The ordering here is the whole requirement. Progression is applied
 * *optimistically* the moment a hand settles (FR-060): the XP, the level, the
 * announcement, and the counters all move before anything is queued, and
 * certainly before anything is sent. `enqueue` is synchronous and nothing is
 * awaited, so a settled hand costs the interface a single synchronous write to
 * `localStorage` and no network at all (NFR-001).
 *
 * A failing sync is therefore invisible except as a passive indicator, which is
 * exactly what FR-062 and FR-063 ask for.
 */

/** Bounded so a long session cannot grow the log without limit (Principle IV). */
const RECENT_HANDS_CAP = 50;

export interface LevelUpAnnouncement {
  readonly level: number;
  readonly unlocks: readonly UnlockId[];
}

export interface ProgressionState {
  playerId: string;
  xp: number;
  level: number;
  handsPlayed: number;
  wins: number;
  losses: number;
  pushes: number;
  netBankrollChange: number;
  unlocks: readonly UnlockId[];
  /** FR-063: how many records are waiting to reach the server. */
  pendingSync: number;
  /** FR-051: set on a threshold crossing, cleared when acknowledged. */
  levelUp: LevelUpAnnouncement | null;
  /** FR-067: this session's hands, for the post-game analysis view. */
  recentHands: readonly HandRecord[];

  progressSnapshot: () => ProgressSnapshot;
  /** FR-024a: derived from two counters, never stored (FR-024b returns null). */
  accuracy: () => number | null;
  hasUnlock: (unlock: UnlockId) => boolean;
  dismissLevelUp: () => void;
  /** T107 — flush, restore, then keep draining. Returns a teardown. */
  startSession: () => () => void;
}

type Set = (partial: Partial<GameState>) => void;
type Get = () => GameState;

export const initialProgression = () => ({
  playerId: '',
  xp: 0,
  level: 1,
  handsPlayed: 0,
  wins: 0,
  losses: 0,
  pushes: 0,
  netBankrollChange: 0,
  unlocks: [] as readonly UnlockId[],
  pendingSync: 0,
  levelUp: null,
  recentHands: [] as readonly HandRecord[],
});

/** FR-052: one round is one hand played, labelled by its headline outcome. */
function tallies(outcome: Outcome): { wins: number; losses: number; pushes: number } {
  if (outcome === 'win' || outcome === 'blackjack') return { wins: 1, losses: 0, pushes: 0 };
  if (outcome === 'loss' || outcome === 'bust') return { wins: 0, losses: 1, pushes: 0 };
  return { wins: 0, losses: 0, pushes: 1 };
}

/**
 * The clock and the identifier the engine could not supply.
 *
 * `settle()` emits a `HandLogRecord` with no `handId` and no `playedAt`,
 * because constitution Principle I forbids the engine from reading a clock or
 * generating randomness outside its injected `Rng`. The store is where that
 * impurity is allowed to live, so it is added here.
 */
function toHandRecord(settled: SettledRound): HandRecord {
  const log = settled.handLog;
  return {
    handId: generateUuid(),
    playedAt: new Date().toISOString(),
    seed: log.seed,
    dealerUpcard: log.dealerUpcard,
    actions: log.actions,
    decisions: log.decisions,
    finalTotals: log.finalTotals,
    outcome: log.outcome,
    netChange: log.netChange,
  };
}

/**
 * T106 — applied on settlement, before anything is queued.
 *
 * Note what is *not* here: no `await`, no promise, no callback. The whole
 * function is synchronous, and that is the property FR-061 actually needs.
 */
export function applySettlement(set: Set, get: Get, settled: SettledRound): void {
  const state = get();
  const log = settled.handLog;

  const { xp, level, levelsGained, newUnlocks } = applyXp(state.xp, xpForHand(log.decisions));
  const tally = tallies(log.outcome);
  const record = toHandRecord(settled);

  set({
    xp,
    level,
    unlocks: [...state.unlocks, ...newUnlocks],
    handsPlayed: state.handsPlayed + 1,
    wins: state.wins + tally.wins,
    losses: state.losses + tally.losses,
    pushes: state.pushes + tally.pushes,
    netBankrollChange: state.netBankrollChange + log.netChange,
    // FR-051: announced on any threshold crossing, including a multi-level one.
    levelUp: levelsGained > 0 ? { level, unlocks: newUnlocks } : state.levelUp,
    recentHands: [record, ...state.recentHands].slice(0, RECENT_HANDS_CAP),
  });

  enqueueHand(record);
  enqueueProgress(get().progressSnapshot());
  set({ pendingSync: pendingCount() });
}

/** Writes a reconciled snapshot back over local state (FR-064). */
function adopt(set: Set, merged: ProgressSnapshot): void {
  set({
    xp: merged.xp,
    level: merged.level,
    handsPlayed: merged.handsPlayed,
    wins: merged.wins,
    losses: merged.losses,
    pushes: merged.pushes,
    decisionsTaken: merged.decisionsTaken,
    decisionsMatched: merged.decisionsMatched,
    bankrollResets: merged.bankrollResets,
    unlocks: merged.unlocks,
    // Boundary rule 4 keeps `bankroll` and `netBankrollChange` local, and
    // `reconcile` has already applied that — they are copied back unchanged.
    netBankrollChange: merged.netBankrollChange,
    bankroll: merged.bankroll,
  });
}

/**
 * T107 — session start.
 *
 * FR-064's ordering is deliberate and easy to get backwards: queued records are
 * flushed *before* the read. Restoring first would fetch a row that does not
 * yet include the hands still sitting in this device's outbox, and the merge
 * would then be against a stale replica.
 *
 * Play has already begun by the time any of this runs (FR-066). Nothing here
 * gates the table, and every failure path simply leaves local state in charge.
 */
function startSession(set: Set, get: Get): () => void {
  const playerId = getPlayerId();
  set({ playerId, pendingSync: pendingCount() });

  const onChange = (): void => set({ pendingSync: pendingCount() });
  let stopDrain: (() => void) | null = null;
  let cancelled = false;

  void (async () => {
    try {
      await drainOutbox(apiTransport(playerId));
      onChange();
    } catch {
      // Nothing to do and nothing to say: the records stay queued (FR-062).
    }

    try {
      const remote = await fetchProgress(playerId);
      if (!cancelled) adopt(set, reconcile(get().progressSnapshot(), remote));
    } catch {
      // FR-060: local state is authoritative, so a failed read changes nothing.
    }

    if (!cancelled) stopDrain = startOutboxDrain(playerId, onChange);
  })();

  return () => {
    cancelled = true;
    stopDrain?.();
  };
}

export function progressionActions(set: Set, get: Get) {
  return {
    progressSnapshot: (): ProgressSnapshot => {
      const state = get();
      return {
        level: state.level,
        xp: state.xp,
        handsPlayed: state.handsPlayed,
        wins: state.wins,
        losses: state.losses,
        pushes: state.pushes,
        netBankrollChange: state.netBankrollChange,
        bankroll: state.bankroll,
        decisionsTaken: state.decisionsTaken,
        decisionsMatched: state.decisionsMatched,
        unlocks: state.unlocks,
        bankrollResets: state.bankrollResets,
      };
    },

    accuracy: (): number | null => evAccuracy(get().decisionsTaken, get().decisionsMatched),

    hasUnlock: (unlock: UnlockId): boolean => get().unlocks.includes(unlock),

    dismissLevelUp: (): void => set({ levelUp: null }),

    startSession: (): (() => void) => startSession(set, get),
  };
}
