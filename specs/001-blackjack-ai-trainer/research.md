# Phase 0 Research: Web-Based Blackjack AI Trainer

**Date**: 2026-07-26 | **Plan**: [plan.md](./plan.md)

The Technical Context carried no `NEEDS CLARIFICATION` markers — the five clarification
questions and decision D1 resolved the open scope items before planning. This document
records the technical decisions the plan depends on, each with its rejected alternatives.

---

## R1. How expected values are produced

**Decision**: Compute exact EV offline in `scripts/generate-ev-tables.ts` and ship the result
as JSON. Runtime does a keyed lookup, never a computation.

**Rationale**: Exact EV for a decision point is a recursive evaluation over the remaining
shoe — dealer outcome probabilities, then each action's value, with hitting requiring
recursion over every draw. Correct implementations take tens of milliseconds to seconds per
point. NFR-002 budgets 100ms p95 for *all* legal actions plus explanation resolution, and
FR-029 demands determinism. Precomputation satisfies both trivially and makes the numbers
testable as fixtures rather than as a live algorithm.

Sizing confirms this is cheap: player states are hard totals 4–21 (18), soft totals 12–21
(10), and pairs (10) = 38 shapes, times 10 dealer upcards, times up to 5 actions ≈ 1,900
values. At full float precision that is roughly 40KB of JSON, well inside the 2-second
first-load budget (NFR-004) and cacheable indefinitely.

**Alternatives considered**:
- *Runtime solver* — rejected: risks the latency budget, and makes determinism a property to
  prove rather than a fact.
- *Monte Carlo simulation at runtime* — rejected outright: nondeterministic by construction,
  which FR-029 forbids.
- *Basic strategy chart only, no EV numbers* — rejected: FR-022 requires each legal action
  displayed *with its expected value*, not just a recommendation.

**Consequence for tasks**: the generator is itself testable code and must be verified against
published EV figures for the Assumption 1 rule set before its output is trusted. This is a
task, not a footnote.

---

## R2. Deterministic randomness

**Decision**: A small seeded PRNG (`mulberry32` or equivalent 32-bit generator) behind an
`Rng` interface injected into the engine. `Math.random` appears nowhere in `src/engine`.

**Rationale**: FR-004 and SC-008 require identical card sequences from identical seeds, and
the constitution bans unseeded randomness in rule modules. A named interface also lets tests
substitute a scripted sequence to force specific hands, which is how edge cases like
split-Aces and five-card hands become testable without hunting for a seed.

**Alternatives considered**:
- *`Math.random`* — rejected: not seedable, so replay and reproducibility are impossible.
- *`crypto.getRandomValues`* — rejected for the same reason; cryptographic quality is
  irrelevant to a play-money trainer.
- *A full Mersenne Twister library* — rejected: a runtime dependency for quality no card game
  needs.

**Shuffle**: Fisher–Yates driven by the injected `Rng`, so shuffle quality is a property of
the algorithm rather than of the generator.

---

## R3. Vercel serverless functions alongside a Vite SPA

**Decision**: Root-level `api/*.ts` files deployed as Vercel Functions, with the Vite build
output served statically.

**Rationale**: Vercel treats a root `api/` directory as functions independently of the
frontend framework, so this works with a plain Vite build and requires no Next.js adoption.
It gives exactly the two endpoints clarification Q2 requires, keeps the Supabase service key
in server-side environment configuration, and leaves the client a static bundle that can be
cached aggressively — which helps NFR-004.

**Alternatives considered**:
- *Next.js API routes* — rejected: adopting a full framework for two handlers, and inheriting
  an SSR model a local-first game cannot use.
- *Supabase Edge Functions* — viable, but splits deployment across two providers and two
  toolchains for no benefit.
- *Direct browser→Supabase* — already rejected in clarification Q2.

**Note on cold starts**: function cold start can exceed the 300ms of NFR-003. This is
acceptable and does not violate the constitution, because no interactive path awaits these
calls — a cold start delays a background sync, which is invisible. The plan does not attempt
to optimise it.

---

## R4. Idempotent persistence

**Decision**: Client generates a `hand_id` UUID per settled hand. `POST /api/hands` performs
`INSERT ... ON CONFLICT (hand_id) DO NOTHING`. Progression counters are written as monotonic
maxima (`GREATEST(existing, incoming)`) rather than increments.

**Rationale**: FR-071 requires that a retry after an ambiguous failure cannot duplicate a log
or double-count a counter. An outbox that retries on timeout will inevitably re-send writes
that already succeeded. Making the write idempotent is the only approach that stays correct
without distributed coordination; making counters monotonic means reconciliation and retry
are the same operation, which also satisfies the spec's boundary rule 4 for free.

**Alternatives considered**:
- *Increment-based counters* (`xp = xp + delta`) — rejected: a duplicate retry silently
  inflates progression, and the bug is invisible until someone audits totals.
- *Server-assigned IDs* — rejected: the client cannot then recognise its own retry.
- *A transaction log with sequence numbers* — rejected: correct, but heavy for two tables.

---

## R5. Client-side durable queue

**Decision**: `localStorage`-backed outbox, drained on an interval and on `online` events,
with exponential backoff and a cap on retained entries.

**Rationale**: FR-062 and FR-064 require queued results to survive a tab close and flush on
return. `localStorage` is synchronous, which matters because `enqueue` runs on the settlement
path and must not await anything (NFR-001). Volume is tens of small records, so the ~5MB
limit is not a real constraint.

**Alternatives considered**:
- *IndexedDB* — correct at larger scale; its async API adds an await to a path the plan is
  trying to keep synchronous, for capacity we do not need.
- *In-memory only* — rejected: violates FR-062's tab-close survival requirement.
- *Background Sync API* — rejected: Safari support is absent, and it would make the offline
  guarantee browser-dependent.

**Cap**: retain at most 500 queued hands; beyond that, drop oldest with a counter of dropped
records. An unbounded queue would violate the constitution's bounded-memory rule.

---

## R6. Preventing layer violations mechanically

**Decision**: ESLint `no-restricted-imports` zone rules forbidding `src/engine` and
`src/strategy` from importing `src/ui`, `src/store`, `src/sync`, `react`, or any network API.
CI fails on violation.

**Rationale**: Constitution Principle I and the Additional Constraints both require
one-directional layering. A rule that only exists in prose gets violated during the first
deadline. Making it a lint error means the boundary is checked on every commit, and it is
also the cheapest way to keep the engine genuinely testable in Node — an accidental `react`
import would break that silently.

**Alternatives considered**:
- *Separate npm workspace packages* — stronger isolation, but adds build complexity that a
  single-app repo does not repay.
- *Code review vigilance* — rejected: not a mechanism.

---

## R7. Explanation library shape

**Decision**: A generated `explanations.json` keyed by `{handShape}|{dealerUpcard}|{action}`,
built from a small set of rationale families expanded across the chart, then spot-edited.
Coverage is asserted by test against the chart's full key set.

**Rationale**: FR-028 requires 100% coverage of charted decision points, and D1 fixed the
content as precomputed rather than generated at runtime. Roughly 300 decision points share
far fewer distinct rationales — "you cannot bust, and the dealer is weak", "the dealer's
strong upcard means you must improve" — so authoring families and expanding is both faster
and more consistent than writing 300 independent strings. The coverage test is what makes the
shortcut safe.


**Alternatives considered**:
- *Hand-write every entry* — same result, more effort, more drift between similar cases.
- *Compose sentences from fragments at runtime* — rejected: produces stilted text and makes
  FR-029 determinism harder to reason about than a literal lookup.

---

## R8. Testing toolchain

**Decision**: Vitest for unit and integration, React Testing Library for component
behaviour, Playwright for end-to-end.

**Rationale**: Vitest reuses the Vite transform pipeline, so there is one configuration and
no separate Babel path — and it is fast enough that the constitution's 30-second budget is
comfortable rather than tight. Playwright's `context.setOffline` allows NFR-007's offline
guarantee to be tested honestly rather than mocked, and its headless CI story is clean.

**Alternatives considered**:
- *Jest* — a second toolchain and transform config for no gain in a Vite project.
- *Cypress* — awkward offline emulation, which is precisely the scenario that matters most
  here.

---

## Open items carried into tasks

None blocking. Two items are flagged for the implementer rather than researched further:

1. **The EV generator must be validated against published figures** before its output is
   trusted (see R1). Treat a mismatch as a generator bug, not a chart disagreement.
2. **The `docs/adr/` records** should be written as the corresponding decisions are
   implemented, not retrofitted at the end, so they capture what was actually true.
