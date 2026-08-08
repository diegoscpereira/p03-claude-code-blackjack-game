// Extensions are mandatory here. `package.json` sets `"type": "module"`, so
// Vercel runs the compiled functions as ESM, and Node's ESM resolver does not
// guess extensions the way a bundler does. Omitting `.js` costs nothing locally
// and crashes every request in production with ERR_MODULE_NOT_FOUND —
// tests/unit/api-imports.test.ts exists so that cannot happen twice.
import { fail, isPlainObject, readPlayerId } from './_lib/http.js';
import type { ApiHandler, ApiRequest, ApiResponse } from './_lib/http.js';
import { supabaseStore } from './_lib/store.js';
import type { DataStore, ProgressRow } from './_lib/store.js';

/**
 * T104 — `GET`/`PUT /api/progress` (contracts/http-api.md).
 *
 * Two things about this handler are load-bearing.
 *
 * **404 is not an error.** A player who has never synced has no row, and
 * FR-066 requires play to begin regardless. Returning 404 rather than
 * synthesising an empty row keeps "new player" distinguishable from "read
 * failed", which is the distinction the client's reconciliation needs.
 *
 * **The merge is monotonic** (R4). Counters take `GREATEST`, unlocks take a
 * union, and only the locally authoritative figures take the incoming value.
 * That makes a duplicate retry a no-op instead of a correctness bug, and it
 * makes reconnect-reconciliation and retry the same operation.
 */

/** Counters that only ever grow, so the larger value is never wrong. */
const MONOTONIC = [
  'xp',
  'hands_played',
  'wins',
  'losses',
  'pushes',
  'decisions_taken',
  'decisions_matched',
  'bankroll_resets',
] as const;

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && Number.isInteger(value);

const isSigned = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value);

/**
 * Builds the row from named fields only. Anything else the client sent is
 * dropped here rather than stored — FR-054 is a promise about what lands in the
 * database, so the handler must not be a pass-through.
 */
function validate(body: unknown): ProgressRow | null {
  if (!isPlainObject(body)) return null;

  const playerId = readPlayerId(body.player_id);
  if (playerId === null) return null;

  if (!isCount(body.level) || body.level < 1 || body.level > 10) return null;
  if (!isCount(body.bankroll)) return null;
  if (!isSigned(body.net_bankroll_change)) return null;
  for (const field of MONOTONIC) if (!isCount(body[field])) return null;

  if (!Array.isArray(body.unlocks) || body.unlocks.some((u) => typeof u !== 'string')) return null;

  return {
    player_id: playerId,
    level: body.level,
    xp: body.xp as number,
    hands_played: body.hands_played as number,
    wins: body.wins as number,
    losses: body.losses as number,
    pushes: body.pushes as number,
    net_bankroll_change: body.net_bankroll_change,
    bankroll: body.bankroll,
    decisions_taken: body.decisions_taken as number,
    decisions_matched: body.decisions_matched as number,
    unlocks: body.unlocks as string[],
    bankroll_resets: body.bankroll_resets as number,
  };
}

/**
 * The merge, applied read-then-write rather than in SQL.
 *
 * A single-player, device-scoped app has no real write contention, and the
 * merge being monotonic means the worst case of a lost update is that one
 * write's counters are superseded by the next one — which self-heals, because
 * the client re-sends absolute totals after every hand. docs/adr/0002 records
 * the trade against an atomic `GREATEST` in SQL.
 */
function merge(existing: ProgressRow | null, incoming: ProgressRow): ProgressRow {
  if (existing === null) return incoming;

  const merged: ProgressRow = { ...incoming };
  for (const field of MONOTONIC) merged[field] = Math.max(existing[field], incoming[field]);

  merged.unlocks = [...new Set([...existing.unlocks, ...incoming.unlocks])];
  return merged;
}

async function handleGet(req: ApiRequest, res: ApiResponse, store: DataStore): Promise<void> {
  const playerId = readPlayerId(req.query.player_id);
  if (playerId === null) return fail(res, 400, 'player_id is required');

  const row = await store.getProgress(playerId);
  // FR-066: not an error condition. The client creates a fresh local player and
  // begins play immediately; the row appears on the first PUT.
  if (row === null) return fail(res, 404, 'no progress for this player');

  res.status(200).json(row);
}

async function handlePut(req: ApiRequest, res: ApiResponse, store: DataStore): Promise<void> {
  const incoming = validate(req.body);
  // FR-070: rejected without a partial write, and safe for the client to retry
  // once corrected.
  if (incoming === null) return fail(res, 400, 'invalid progress payload');

  const merged = merge(await store.getProgress(incoming.player_id), incoming);
  await store.putProgress(merged);
  res.status(200).json(merged);
}

/** Exposed as a factory so the contract tests can supply an in-memory store. */
export function createProgressHandler(store: DataStore): ApiHandler {
  return async (req, res) => {
    try {
      if (req.method === 'GET') return await handleGet(req, res, store);
      if (req.method === 'PUT') return await handlePut(req, res, store);
      fail(res, 405, `${req.method ?? 'unknown'} is not supported`);
    } catch {
      // FR-062: the client keeps the record queued and retries with backoff, so
      // the useful thing to return is a status it can act on — not a detail of
      // the failure that would only ever reach a log nobody reads.
      fail(res, 503, 'progress store unavailable');
    }
  };
}

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  let store: DataStore;
  try {
    store = supabaseStore();
  } catch (error) {
    // Server-side only: the reason goes to the platform log, never to the
    // client, which gets a status it can act on and nothing more. Swallowing
    // this silently made a misconfigured deploy undiagnosable from outside.
    console.error('progress store unavailable:', error);
    // FR-062 keeps the record queued and retried, so a misconfigured deploy
    // loses no progression.
    return fail(res, 503, 'progress store is not configured');
  }
  await createProgressHandler(store)(req, res);
}
