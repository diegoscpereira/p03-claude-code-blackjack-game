-- T103 — the whole persistence model (data-model.md Part 2).
--
-- Two flat tables, no triggers, no functions, no auth schema, and No RLS
-- policies (FR-065, by explicit direction). Access control is the server-side
-- endpoints in api/ and nothing else: every query there is scoped by player_id,
-- and the service credential never leaves Vercel's environment configuration.
-- docs/adr/0002 records that decision and the exposure it accepts.
--
-- Apply with:  psql "$SUPABASE_DB_URL" -f supabase/schema.sql

create table if not exists user_progress (
  player_id uuid primary key,
  level int not null default 1 check (level between 1 and 10),
  xp bigint not null default 0 check (xp >= 0),
  hands_played bigint not null default 0 check (hands_played >= 0),
  wins bigint not null default 0 check (wins >= 0),
  losses bigint not null default 0 check (losses >= 0),
  pushes bigint not null default 0 check (pushes >= 0),
  net_bankroll_change bigint not null default 0,
  decisions_taken bigint not null default 0 check (decisions_taken >= 0),
  decisions_matched bigint not null default 0 check (decisions_matched >= 0),
  unlocks text[] not null default '{}',
  bankroll bigint not null default 0 check (bankroll >= 0),
  bankroll_resets int not null default 0 check (bankroll_resets >= 0),
  updated_at timestamptz not null default now()
);

-- The EV accuracy score is deliberately absent. It is decisions_matched over
-- decisions_taken, computed on read (FR-024a). Stored, it could disagree with
-- its own inputs after a partial sync — a state worth making unrepresentable.

create table if not exists hand_logs (
  hand_id uuid primary key,
  player_id uuid not null,
  played_at timestamptz not null,
  seed bigint not null,
  dealer_upcard text not null,
  actions jsonb not null,
  decisions jsonb not null,
  final_totals jsonb not null,
  outcome text not null check (outcome in ('win', 'loss', 'push', 'blackjack', 'bust')),
  net_change int not null
);

-- hand_id being the primary key is what makes the write idempotent: the insert
-- is ON CONFLICT (hand_id) DO NOTHING, so a retry after an ambiguous failure
-- cannot duplicate a log (FR-071).

-- The only read path this table has: the post-game analysis view, newest first.
-- It is written far more often than it is read, so nothing else is indexed.
create index if not exists hand_logs_player_time on hand_logs (player_id, played_at desc);

-- Neither table stores personal information (FR-054): a generated identifier,
-- gameplay counters, and hand outcomes. tests/integration/schema-shape.test.ts
-- enumerates the allowed columns and fails if a later migration adds any other.
