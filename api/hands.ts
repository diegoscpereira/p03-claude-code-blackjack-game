// `.js` extensions are mandatory under Node ESM — see the note in progress.ts.
import { UUID_PATTERN, fail, isPlainObject, readPlayerId } from './_lib/http.js';
import type { ApiHandler, ApiRequest, ApiResponse } from './_lib/http.js';
import { supabaseStore } from './_lib/store.js';
import type { DataStore, HandRow } from './_lib/store.js';

/**
 * T105 — `POST /api/hands` (contracts/http-api.md).
 *
 * Append-only, batched, and idempotent by `hand_id` (FR-071). The client
 * generates that id at settlement, so a retry after an ambiguous failure
 * inserts nothing and still returns 200 — `skipped` is a normal outcome, not a
 * warning, and reporting it separately is what lets the outbox tell "already
 * stored" apart from "never arrived".
 *
 * Batches are all-or-nothing (FR-070). A partial write would leave a client
 * with no correct next move: re-sending risks duplicates it cannot detect, and
 * not re-sending risks losing hands it cannot identify.
 */

/** contracts/http-api.md: 50 hands per request. */
const BATCH_LIMIT = 50;

/** data-model.md: the `outcome` check constraint, mirrored here. */
const OUTCOMES = ['win', 'loss', 'push', 'blackjack', 'bust'];

/**
 * Validates one record and projects it onto the schema's columns.
 *
 * `player_id` comes from the request, never from the record — FR-069 requires
 * that no parameter other than the request's identifier can select the row a
 * write lands in, and a per-record owner field would be exactly such a
 * parameter.
 */
function toRow(value: unknown, playerId: string): HandRow | null {
  if (!isPlainObject(value)) return null;
  if (typeof value.hand_id !== 'string' || !UUID_PATTERN.test(value.hand_id)) return null;
  if (typeof value.played_at !== 'string' || value.played_at.length === 0) return null;
  if (typeof value.seed !== 'number' || !Number.isFinite(value.seed)) return null;
  if (typeof value.dealer_upcard !== 'string' || value.dealer_upcard.length === 0) return null;
  if (!Array.isArray(value.actions) || !Array.isArray(value.decisions)) return null;
  if (!isPlainObject(value.final_totals)) return null;
  if (typeof value.outcome !== 'string' || !OUTCOMES.includes(value.outcome)) return null;
  if (typeof value.net_change !== 'number' || !Number.isInteger(value.net_change)) return null;

  return {
    hand_id: value.hand_id,
    player_id: playerId,
    played_at: value.played_at,
    seed: value.seed,
    dealer_upcard: value.dealer_upcard,
    actions: value.actions,
    decisions: value.decisions,
    final_totals: value.final_totals,
    outcome: value.outcome,
    net_change: value.net_change,
  };
}

/** Collapses repeats inside one batch, keeping the first occurrence. */
function deduplicate(rows: readonly HandRow[]): HandRow[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (seen.has(row.hand_id)) return false;
    seen.add(row.hand_id);
    return true;
  });
}

async function handlePost(req: ApiRequest, res: ApiResponse, store: DataStore): Promise<void> {
  if (!isPlainObject(req.body)) return fail(res, 400, 'body must be an object');

  const playerId = readPlayerId(req.body.player_id);
  if (playerId === null) return fail(res, 400, 'player_id is required');

  const hands = req.body.hands;
  if (!Array.isArray(hands)) return fail(res, 400, 'hands must be an array');
  if (hands.length > BATCH_LIMIT) return fail(res, 400, `at most ${BATCH_LIMIT} hands per request`);

  const rows: HandRow[] = [];
  for (const hand of hands) {
    const row = toRow(hand, playerId);
    // FR-070: one bad record rejects the batch, before anything is written.
    if (row === null) return fail(res, 400, 'invalid hand record');
    rows.push(row);
  }

  const result = await store.insertHands(deduplicate(rows));
  res.status(200).json(result);
}

/** Exposed as a factory so the contract tests can supply an in-memory store. */
export function createHandsHandler(store: DataStore): ApiHandler {
  return async (req, res) => {
    try {
      if (req.method === 'POST') return await handlePost(req, res, store);
      fail(res, 405, `${req.method ?? 'unknown'} is not supported`);
    } catch {
      // FR-062: retryable, and safe to retry — that is what FR-071 buys.
      fail(res, 503, 'hand log store unavailable');
    }
  };
}

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  let store: DataStore;
  try {
    store = supabaseStore();
  } catch (error) {
    // Retryable rather than fatal, and logged server-side — see progress.ts.
    console.error('hand log store unavailable:', error);
    return fail(res, 503, 'hand log store is not configured');
  }
  await createHandsHandler(store)(req, res);
}
