# ADR 0001 — Precompute expected values at build time

**Status**: Accepted · **Date**: 2026-08-04 · **Requirements**: FR-020, FR-022, NFR-002, NFR-007, SC-003

## Context

The companion must show an expected value for *every legal action* at *every* decision point
(FR-022), agree with a published basic strategy chart at 100% of its cells (SC-003), and
resolve within 100ms at the 95th percentile alongside the explanation (NFR-002) — while
remaining fully functional with the network disabled (NFR-007).

Exact EV for one decision point is a recursive evaluation over the remaining shoe: the
dealer's outcome distribution, then each action's value, with hitting recursing over every
possible draw. Correct implementations take tens of milliseconds to seconds *per point*.

## Decision

Solve every decision point offline in `scripts/ev-solver.ts` and ship the result as
`src/strategy/data/ev-tables.json`. At runtime `src/strategy/ev.ts` performs a keyed lookup —
no computation, no `await`.

380 decision points (38 player shapes × 10 dealer upcards), 23.7KB of JSON.

## Consequences

**Good.** NFR-002 stops being a performance problem and becomes a non-issue: a hash lookup is
microseconds. FR-029's determinism is a fact rather than a property to prove. The numbers are
testable as fixtures, and a full sweep of the chart runs in under 100ms in CI, which is
asserted rather than assumed.

**Costs.** The table is generated, not committed, so `npm run generate:ev` is a prerequisite
of the build and CI runs it before typecheck. A rules change — a different deck count, or
standing on soft 17 — requires regeneration; the table records the rules it was built for so a
mismatch is detectable.

**The table is only as good as the solver.** research.md R1 sets the tie-break rule: when the
generated table and the published chart disagree, it is a *generator bug*, never a chart
disagreement. That rule earned its place during implementation. The first run disagreed with
the chart at exactly one cell of 370 — soft 14 against a dealer 4 — and the cause was a real
defect in the solver's incremental total: drawing an Ace onto an already-soft hand demoted the
total correctly but marked the hand **hard**, understating the value of hitting every soft
hand by enough to move the soft-doubling boundary a full row. Fixing it brought the chart to
100% agreement. Had we "corrected" the fixture instead, the bug would have shipped.

## Alternatives rejected

**Runtime solver.** Rejected on latency and determinism: it puts a recursive shoe evaluation
on a path budgeted at 100ms, and makes reproducibility something to demonstrate rather than a
property of a static file.

**Monte Carlo simulation at runtime.** Rejected outright — nondeterministic by construction,
which FR-029 forbids.

**Basic strategy chart only, no EV numbers.** Smaller and simpler, but FR-022 requires each
legal action displayed *with its expected value*, not merely a recommendation. A chart alone
answers "what" and never "by how much", which is the part Alex came to check.

## Notes on the model

Documented in full at the top of `scripts/ev-solver.ts`. Two choices worth surfacing here:

- **Card removal is exact** along each draw path, with the memo keyed on the remaining
  composition. An earlier version held the composition fixed; measurement showed the
  difference was in the fourth decimal, but the memo was then unsound, so exactness was the
  cheaper correctness story.
- **The dealer is modelled with a peek.** Hole cards that would make a natural are excluded
  and the rest renormalised, because such a round ends before the player decides. This is why
  the Ace and ten columns do not match *unconditional* published bust rates, and the
  validation test asserts that difference deliberately rather than papering over it.
- **Resplitting is not modelled** in the split EV. It adds value only to hands that are
  already clear splits (Aces and 8s), so it cannot change which action wins.
