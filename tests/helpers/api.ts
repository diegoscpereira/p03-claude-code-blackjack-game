import type { ApiHandler, ApiRequest } from '../../api/_lib/http';
import type { DataStore, HandRow, ProgressRow } from '../../api/_lib/store';

/**
 * Test harness for the two serverless handlers.
 *
 * The handlers are written as factories over a `DataStore` port precisely so
 * that this file can exist: the contract tests exercise real handler logic —
 * validation, merge semantics, scoping, status codes — with no network, no
 * Supabase project, and no credential. What is *not* under test here is the SQL
 * itself, which is why `supabase/schema.sql` gets its own assertion in T103a.
 */

export interface Invocation {
  status: number;
  body: unknown;
}

/** Drives a handler and captures whatever it wrote to the response. */
export async function invoke(handler: ApiHandler, request: Partial<ApiRequest>): Promise<Invocation> {
  const captured: Invocation = { status: 200, body: undefined };

  const response = {
    status(code: number) {
      captured.status = code;
      return response;
    },
    json(body: unknown) {
      captured.body = body;
    },
  };

  await handler({ method: 'GET', query: {}, body: undefined, ...request }, response);
  return captured;
}

export interface FakeStore extends DataStore {
  /** Every row currently held, for assertions about what was actually written. */
  progressRows: Map<string, ProgressRow>;
  handRows: Map<string, HandRow>;
  /** Forces the next call of either method to reject, simulating an outage. */
  failNext: (error?: Error) => void;
}

/** An in-memory `DataStore` with the same uniqueness guarantees as the schema. */
export function fakeStore(): FakeStore {
  const progressRows = new Map<string, ProgressRow>();
  const handRows = new Map<string, HandRow>();
  let pendingFailure: Error | null = null;

  const checkFailure = (): void => {
    if (pendingFailure) {
      const error = pendingFailure;
      pendingFailure = null;
      throw error;
    }
  };

  return {
    progressRows,
    handRows,
    failNext(error = new Error('store unavailable')) {
      pendingFailure = error;
    },

    async getProgress(playerId) {
      checkFailure();
      return progressRows.get(playerId) ?? null;
    },

    async putProgress(row) {
      checkFailure();
      progressRows.set(row.player_id, row);
    },

    async insertHands(rows) {
      checkFailure();
      let inserted = 0;
      let skipped = 0;
      for (const row of rows) {
        // `hand_id` is the primary key, so a repeat is a no-op rather than an
        // error — this is `ON CONFLICT DO NOTHING` (FR-071).
        if (handRows.has(row.hand_id)) skipped += 1;
        else {
          handRows.set(row.hand_id, row);
          inserted += 1;
        }
      }
      return { inserted, skipped };
    },
  };
}

export const PLAYER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const PLAYER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

/** A valid `PUT /api/progress` body, overridable field by field. */
export function progressBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    player_id: PLAYER_A,
    level: 4,
    xp: 224,
    hands_played: 37,
    wins: 18,
    losses: 16,
    pushes: 3,
    net_bankroll_change: -45,
    bankroll: 955,
    decisions_taken: 64,
    decisions_matched: 51,
    unlocks: ['post_game_analysis'],
    bankroll_resets: 0,
    ...overrides,
  };
}

/** A valid entry for a `POST /api/hands` batch. */
export function handBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    hand_id: '11111111-1111-4111-8111-111111111111',
    played_at: '2026-07-26T18:22:41.000Z',
    seed: 918273645,
    dealer_upcard: '10',
    actions: [{ handId: 'h1', action: 'hit' }],
    decisions: [
      {
        handId: 'h1',
        playerTotal: 16,
        isSoft: false,
        dealerUpcard: '10',
        chosen: 'hit',
        recommended: 'hit',
        matched: true,
      },
    ],
    final_totals: { player: [21], dealer: 19 },
    outcome: 'win',
    net_change: 10,
    ...overrides,
  };
}
