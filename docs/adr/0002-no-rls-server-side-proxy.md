# ADR 0002 — No RLS; the database is reached only through our own endpoints

**Status**: Accepted · **Date**: 2026-08-08 · **Requirements**: FR-065, FR-068, FR-069, FR-070, FR-071, NFR-005

## Context

The feature was specified with an explicit exclusion: **no Row Level Security policies, no
multi-tenant permission model, no admin roles** (FR-065, and the Out of Scope list). That is a
direction, not a discovery — the project is a single-player, play-money trainer with
device-scoped identity and no accounts.

RLS is normally what makes a browser-held Supabase key safe: the key is public by design, and
policies decide which rows it can reach. Remove the policies and that key becomes an
unrestricted credential over every row in both tables. So excluding RLS is not a neutral
simplification; it removes the mechanism that a direct browser→database architecture depends
on, and something has to take its place.

Clarification Q2 settled what that something is.

## Decision

The client never holds a database credential and never contacts the database. All reads and
writes go through two of the application's own serverless endpoints (FR-068):

- `GET`/`PUT /api/progress`
- `POST /api/hands`

The service key exists only in Vercel's server-side environment configuration, read
exclusively inside `api/_lib/store.ts`. No `VITE_`-prefixed variable ever carries it — that
prefix is precisely what Vite inlines into the client bundle, so the boundary is structural
rather than procedural, and `npm run check:bundle` fails the build if it is ever crossed.

Scoping is by `player_id` and nothing else (FR-069). A request without one is rejected 400;
no endpoint accepts a table name, a column list, or a filter expression; and the hand-log
writer stamps rows with the identifier from the *request*, never one carried in the record.
`tests/integration/api-scoping.test.ts` asserts each of those, because with RLS gone these
handlers are the entire access-control story and "it looks right" is not a mechanism.

## Consequences

**Good.** The credential's blast radius is one directory. The schema stays flat and readable —
two tables, no policy DSL, no auth schema — which is worth something in a repository meant to
be read (User Story 7). Validation, merge semantics, and scoping all live in TypeScript where
they are unit-testable without a database; the contract tests run against an in-memory store
with no project, no network, and no credential.

**The exposure this accepts.** Anyone can call `/api/progress` with any UUID. With a guessed
or observed `player_id` they could read or inflate that player's counters. There are no
accounts, no personal data (FR-054), and no real stakes, so the worst outcome is a corrupted
play-money statistic. That is the bound, and it is stated here rather than left implicit. Two
things narrow it further and are worth naming: identifiers are v4 UUIDs, so guessing is not a
practical attack; and progression counters are monotonic, so the *only* forgery that succeeds
is one that inflates someone's numbers upward.

**No rate limiting in Phase 1.** Flagged in the clarification coverage summary as an
outstanding low-impact item, and it is the first thing to add before any public launch.

**The merge is read-then-write, not atomic.** `api/progress.ts` reads the row, merges in
TypeScript, and writes it back. Two concurrent writes can lose an update. Because the merge is
monotonic and the client sends absolute totals after every hand, the loss self-heals on the
next write, and the two-tab scenario the spec calls out converges. An atomic `GREATEST` in SQL
would remove the window at the cost of putting the merge rule in a place the client could not
share — and the client needs the same rule for session-start reconciliation (boundary rule 4).
One rule in `src/sync/reconcile.ts` and `api/progress.ts` beats two rules that agree by
inspection.

## Alternatives rejected

**Direct browser → Supabase with RLS.** The conventional answer, and rejected by FR-065 before
the architecture was drawn. It would also need an auth identity for policies to key on, which
the Out of Scope list excludes.

**Direct browser → Supabase without RLS.** What removing the policies would actually mean: an
unrestricted database credential shipped in the client bundle, readable by anyone who opens
the network tab. Not defensible at any stakes, and it fails the constitution's Data Safety
gate outright.

**Supabase Edge Functions.** Would give the same server-side boundary, but splits deployment
across two providers and two toolchains for no benefit when the frontend already deploys to
Vercel (research.md R3).

**A signed token per device.** Would close the "call with any UUID" hole. Rejected as
disproportionate: it reintroduces key management and a token lifecycle to protect play-money
counters, and Phase 1 explicitly has no accounts to hang it from. Worth revisiting only if
this ever stores something a person would mind losing.
