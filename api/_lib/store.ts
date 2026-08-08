import { createClient } from '@supabase/supabase-js';

/**
 * The data-access port, and its Supabase implementation.
 *
 * The handlers are written against this interface rather than against Supabase
 * directly, for two reasons. The contract tests exercise real handler logic —
 * validation, merge semantics, scoping — with no project and no credential.
 * And the credential is confined to one function in one file, which is a much
 * easier thing to review than "somewhere in `api/`".
 *
 * Constitution, Additional Constraints: handlers hold no state between
 * invocations. The client is created per call rather than cached at module
 * scope; a warm Vercel instance reuses the underlying HTTP agent anyway, and
 * nothing here is on an interactive path (R3).
 */

export interface ProgressRow {
  player_id: string;
  level: number;
  xp: number;
  hands_played: number;
  wins: number;
  losses: number;
  pushes: number;
  net_bankroll_change: number;
  bankroll: number;
  decisions_taken: number;
  decisions_matched: number;
  unlocks: string[];
  bankroll_resets: number;
}

export interface HandRow {
  hand_id: string;
  player_id: string;
  played_at: string;
  seed: number;
  dealer_upcard: string;
  actions: unknown;
  decisions: unknown;
  final_totals: unknown;
  outcome: string;
  net_change: number;
}

export interface DataStore {
  getProgress(playerId: string): Promise<ProgressRow | null>;
  putProgress(row: ProgressRow): Promise<void>;
  /** Idempotent by `hand_id`: an existing row is skipped, never an error. */
  insertHands(rows: readonly HandRow[]): Promise<{ inserted: number; skipped: number }>;
}

/**
 * Reads the service credential from server-side environment configuration.
 *
 * Never `VITE_`-prefixed: that prefix is what Vite inlines into the client
 * bundle, so the boundary here is structural rather than procedural, and
 * `npm run check:bundle` fails the build if it is ever crossed.
 */
/**
 * The role a Supabase JWT carries, or null for a non-JWT key format.
 *
 * Read without verification on purpose: this is our own key, and the only use
 * is a configuration diagnostic. It exists because the failure it catches —
 * an `anon` key pasted where the service key belongs — surfaces from Postgres
 * as a bare `permission denied for table user_progress`, which points at the
 * schema rather than at the credential and costs an hour to chase.
 */
function roleOf(key: string): string | null {
  const payload = key.split('.')[1];
  if (!payload) return null;
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return typeof decoded?.role === 'string' ? decoded.role : null;
  } catch {
    return null;
  }
}

export function supabaseStore(): DataStore {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be configured');

  const role = roleOf(key);
  if (role !== null && role !== 'service_role') {
    // Server-side log only — the role name, never the key. With no RLS
    // (FR-065), any role other than service_role has no grants at all, so this
    // is a hard misconfiguration rather than a degraded mode.
    console.error(
      `SUPABASE_SERVICE_KEY carries role "${role}", not "service_role" — ` +
        'every query will fail with "permission denied". Use the service_role key.',
    );
  }

  const client = createClient(url, key, { auth: { persistSession: false } });

  return {
    async getProgress(playerId) {
      const { data, error } = await client
        .from('user_progress')
        .select('*')
        .eq('player_id', playerId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as ProgressRow | null) ?? null;
    },

    async putProgress(row) {
      const { error } = await client.from('user_progress').upsert(row, { onConflict: 'player_id' });
      if (error) throw new Error(error.message);
    },

    async insertHands(rows) {
      if (rows.length === 0) return { inserted: 0, skipped: 0 };

      // `ignoreDuplicates` is `ON CONFLICT (hand_id) DO NOTHING` (FR-071). The
      // response carries only the rows actually inserted, which is exactly the
      // `inserted`/`skipped` split the contract reports.
      const { data, error } = await client
        .from('hand_logs')
        .upsert(rows as HandRow[], { onConflict: 'hand_id', ignoreDuplicates: true })
        .select('hand_id');
      if (error) throw new Error(error.message);

      const inserted = data?.length ?? 0;
      return { inserted, skipped: rows.length - inserted };
    },
  };
}
