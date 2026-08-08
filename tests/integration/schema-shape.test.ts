import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * T103a — FR-054: no personal data, enforced against the schema itself.
 *
 * This test enumerates the exact allowed columns and fails if any column
 * outside that list appears. That inverts the usual direction of a schema test:
 * it is not checking that the columns we need exist, it is checking that
 * nothing *else* does. A later migration adding an `email` or a `display_name`
 * should have to argue with a failing test, not slip through review.
 */

// Resolved from the working directory rather than `import.meta.url`: these
// tests run under jsdom, where the module URL is an http one and `readFileSync`
// rejects it.
const SCHEMA = readFileSync(resolve(process.cwd(), 'supabase/schema.sql'), 'utf8');

const ALLOWED_USER_PROGRESS = [
  'player_id',
  'level',
  'xp',
  'hands_played',
  'wins',
  'losses',
  'pushes',
  'net_bankroll_change',
  'decisions_taken',
  'decisions_matched',
  'unlocks',
  'bankroll',
  'bankroll_resets',
  'updated_at',
] as const;

const ALLOWED_HAND_LOGS = [
  'hand_id',
  'player_id',
  'played_at',
  'seed',
  'dealer_upcard',
  'actions',
  'decisions',
  'final_totals',
  'outcome',
  'net_change',
] as const;

/**
 * Pulls the column names out of a `create table` block. Deliberately naive: it
 * reads the first identifier of each top-level line, which is exactly what a
 * column definition looks like, and skips table-level constraints.
 */
function columnsOf(table: string): string[] {
  const match = SCHEMA.match(new RegExp(`create\\s+table[^(]*\\b${table}\\b[^(]*\\(([\\s\\S]*?)\\n\\);`, 'i'));
  if (!match?.[1]) throw new Error(`no create table statement found for ${table}`);

  return match[1]
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('--'))
    .map((line) => line.match(/^([a-z_][a-z0-9_]*)/i)?.[1])
    .filter((name): name is string => Boolean(name))
    .filter((name) => !['primary', 'constraint', 'check', 'unique', 'foreign'].includes(name.toLowerCase()));
}

describe('user_progress shape (FR-054, data-model.md)', () => {
  const columns = columnsOf('user_progress');

  it('FR-054: contains no column outside the allowed list', () => {
    expect(columns.sort()).toEqual([...ALLOWED_USER_PROGRESS].sort());
  });

  it.each(ALLOWED_USER_PROGRESS)('declares %s', (column) => {
    expect(columns).toContain(column);
  });

  it('data-model.md: the EV accuracy score is not a column', () => {
    // It is derived from two counters on read. A column could disagree with its
    // own inputs after a partial sync (FR-024a).
    expect(columns).not.toContain('ev_accuracy');
  });

  it('FR-065: player_id is the primary key', () => {
    expect(SCHEMA).toMatch(/player_id\s+uuid\s+primary\s+key/i);
  });

  it('FR-051d: the level is constrained to the ten-level ladder', () => {
    expect(SCHEMA).toMatch(/level[\s\S]*?check\s*\(\s*level\s+between\s+1\s+and\s+10\s*\)/i);
  });

  it('FR-050: xp cannot go negative', () => {
    expect(SCHEMA).toMatch(/xp[\s\S]*?check\s*\(\s*xp\s*>=\s*0\s*\)/i);
  });
});

describe('hand_logs shape (FR-054, FR-067)', () => {
  const columns = columnsOf('hand_logs');

  it('FR-054: contains no column outside the allowed list', () => {
    expect(columns.sort()).toEqual([...ALLOWED_HAND_LOGS].sort());
  });

  it('FR-071: hand_id is the primary key, which is what makes the write idempotent', () => {
    expect(SCHEMA).toMatch(/hand_id\s+uuid\s+primary\s+key/i);
  });

  it('FR-013: the outcome is constrained to the settled vocabulary', () => {
    for (const outcome of ['win', 'loss', 'push', 'blackjack', 'bust']) {
      expect(SCHEMA).toContain(`'${outcome}'`);
    }
  });

  it('data-model.md: the analysis index is on (player_id, played_at desc)', () => {
    expect(SCHEMA).toMatch(/create\s+index[\s\S]*?hand_logs\s*\(\s*player_id\s*,\s*played_at\s+desc\s*\)/i);
  });
});

describe('access model (FR-065, FR-068)', () => {
  it('FR-065: declares no row-level security policy', () => {
    expect(SCHEMA.toLowerCase()).not.toContain('create policy');
    expect(SCHEMA.toLowerCase()).not.toContain('enable row level security');
  });

  it('FR-068: records why RLS is absent, so its absence reads as a decision', () => {
    expect(SCHEMA.toLowerCase()).toContain('no rls');
  });

  it('FR-054: mentions no personal-data column anywhere in the file', () => {
    for (const forbidden of ['email', 'password', 'display_name', 'username', 'ip_address', 'phone']) {
      expect(SCHEMA.toLowerCase()).not.toContain(forbidden);
    }
  });
});
