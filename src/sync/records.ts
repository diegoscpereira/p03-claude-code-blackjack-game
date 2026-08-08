import type { ActionRecord, Decision, Outcome, Rank } from '../engine/types';
import type { UnlockId } from '../progression/levels';

/**
 * The two payloads that cross the network, and the mapping to their wire form.
 *
 * The application speaks camelCase and the database speaks snake_case. That
 * translation lives here, in one place, rather than at each call site — the
 * alternative is a slow leak of `net_bankroll_change` into React components,
 * and eventually two spellings of the same field that differ by a typo.
 */

/** One settled hand, as `POST /api/hands` carries it (contracts/http-api.md). */
export interface HandRecord {
  /** Client-generated at settlement; the idempotency key (FR-071). */
  readonly handId: string;
  readonly playedAt: string;
  readonly seed: number;
  readonly dealerUpcard: Rank;
  readonly actions: readonly ActionRecord[];
  readonly decisions: readonly Decision[];
  readonly finalTotals: { readonly player: readonly number[]; readonly dealer: number };
  readonly outcome: Outcome;
  readonly netChange: number;
}

/**
 * Lifetime progression as absolute totals, never deltas (R4).
 *
 * That choice is what makes a retry harmless: the same payload applied twice
 * produces the same row. Deltas would turn every ambiguous failure into a
 * correctness bug that stays invisible until someone audits the totals.
 */
export interface ProgressSnapshot {
  readonly level: number;
  readonly xp: number;
  readonly handsPlayed: number;
  readonly wins: number;
  readonly losses: number;
  readonly pushes: number;
  readonly netBankrollChange: number;
  readonly bankroll: number;
  readonly decisionsTaken: number;
  readonly decisionsMatched: number;
  readonly unlocks: readonly UnlockId[];
  readonly bankrollResets: number;
}

export const EMPTY_PROGRESS: ProgressSnapshot = {
  level: 1,
  xp: 0,
  handsPlayed: 0,
  wins: 0,
  losses: 0,
  pushes: 0,
  netBankrollChange: 0,
  bankroll: 0,
  decisionsTaken: 0,
  decisionsMatched: 0,
  unlocks: [],
  bankrollResets: 0,
};

/** Wire form of a hand record. */
export function toHandBody(record: HandRecord): Record<string, unknown> {
  return {
    hand_id: record.handId,
    played_at: record.playedAt,
    seed: record.seed,
    dealer_upcard: record.dealerUpcard,
    actions: record.actions,
    decisions: record.decisions,
    final_totals: record.finalTotals,
    outcome: record.outcome,
    net_change: record.netChange,
  };
}

/** Wire form of a progression snapshot, scoped to a player (FR-069). */
export function toProgressBody(
  playerId: string,
  snapshot: ProgressSnapshot,
): Record<string, unknown> {
  return {
    player_id: playerId,
    level: snapshot.level,
    xp: snapshot.xp,
    hands_played: snapshot.handsPlayed,
    wins: snapshot.wins,
    losses: snapshot.losses,
    pushes: snapshot.pushes,
    net_bankroll_change: snapshot.netBankrollChange,
    bankroll: snapshot.bankroll,
    decisions_taken: snapshot.decisionsTaken,
    decisions_matched: snapshot.decisionsMatched,
    unlocks: snapshot.unlocks,
    bankroll_resets: snapshot.bankrollResets,
  };
}

const numberAt = (source: Record<string, unknown>, key: string, fallback: number): number => {
  const value = source[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
};

/**
 * Reads a server response back into a snapshot, tolerating anything unexpected.
 * A malformed reply degrades field by field to the empty progression rather
 * than throwing — a background sync must never be able to break a live session.
 */
export function fromProgressBody(body: unknown): ProgressSnapshot | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
  const row = body as Record<string, unknown>;

  const unlocks = Array.isArray(row.unlocks)
    ? row.unlocks.filter((value): value is UnlockId => typeof value === 'string')
    : [];

  return {
    level: numberAt(row, 'level', 1),
    xp: numberAt(row, 'xp', 0),
    handsPlayed: numberAt(row, 'hands_played', 0),
    wins: numberAt(row, 'wins', 0),
    losses: numberAt(row, 'losses', 0),
    pushes: numberAt(row, 'pushes', 0),
    netBankrollChange: numberAt(row, 'net_bankroll_change', 0),
    bankroll: numberAt(row, 'bankroll', 0),
    decisionsTaken: numberAt(row, 'decisions_taken', 0),
    decisionsMatched: numberAt(row, 'decisions_matched', 0),
    unlocks,
    bankrollResets: numberAt(row, 'bankroll_resets', 0),
  };
}
