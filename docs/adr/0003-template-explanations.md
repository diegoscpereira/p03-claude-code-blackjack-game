# ADR 0003 — Explanations are authored and resolved locally, not generated at runtime

**Status**: Accepted · **Date**: 2026-08-08 · **Requirements**: FR-023, FR-027, FR-028, FR-029, NFR-002, NFR-007, SC-010

## Context

FR-023 requires that when the companion recommends an action, it explains *why* in plain
language. The obvious modern answer — and the one the project's framing invites, given "AI" is
in the title — is to call a language model.

Four requirements make that answer expensive:

- **FR-029 — determinism.** The same hand shape, dealer upcard, and recommended action must
  always resolve to the same explanation. A sampled model does not do this without pinning
  temperature to zero and caching, at which point it is a lookup table with extra steps and a
  bill.
- **FR-028 and SC-010 — 100% coverage.** Every charted decision point must resolve to an
  explanation, with no gaps. A generated system can only demonstrate this by generating every
  point in advance — which is, again, a table.
- **NFR-002 — 100 ms** for expected values *and* the matching explanation, at p95.
- **NFR-007 — the game works with the network disabled.** A runtime model call is the one thing
  that cannot.

Decision D1, taken during `/speckit-specify`, settled it before planning began.

## Decision

Explanations are precomputed content in `src/strategy/data/explanations.json`, keyed on
`{handShape}|{dealerUpcard}|{action}` and resolved by a synchronous lookup in
`src/strategy/explanations.ts`.

The library is authored as a small set of **rationale families** — "you cannot bust, and the
dealer is weak", "the dealer's strong upcard means you must improve" — expanded across the
chart and then spot-edited. Roughly 300 decision points share far fewer distinct reasons, so
authoring families is both faster and more consistent than writing 300 independent strings
(research.md R7).

**A missing key returns `null`, never placeholder text** (FR-027). The interface then shows the
recommendation and its expected value alone. "No explanation" is a better answer than a
sentence that sounds like one and is not.

## Consequences

**Good.** FR-029 is satisfied by the data structure rather than by configuration: a literal
lookup cannot be nondeterministic. NFR-002 and NFR-007 stop being constraints at all. Coverage
is a *test* — `tests/unit/strategy/explanations.test.ts` asserts that every charted decision
point resolves, so a gap fails CI rather than surfacing to a player mid-hand. There is no
API key, no rate limit, no latency budget, and no per-explanation cost.

**Costs.** The prose is fixed. It cannot adapt to a player's history, answer a follow-up
question, or vary its register for a beginner versus an experienced player. A player who reads
the same rationale family twenty times will notice the repetition — that is a real product
limitation, and the honest mitigation was to write more families rather than to pretend it is
not there.

**The library must be regenerated when the rules change.** A different deck count or standing
on soft 17 moves chart cells, and an explanation attached to a cell whose recommendation has
changed becomes wrong rather than merely stale. The coverage test catches missing keys; it does
not catch a rationale that no longer matches its cell, so rule changes require a re-read.

**Framing.** This is the decision that makes the "AI" in this project decision-theoretic rather
than generative, and the README says so plainly rather than letting the word do ambiguous work.

## Alternatives rejected

**Runtime language-model generation.** Rejected by D1 and by four requirements above. It is
worth being precise about which one is fatal: not cost, and not latency — those are tunable.
It is FR-029 together with NFR-007. An explanation that changes between two identical hands
undermines the one thing a *trainer* is for, and a trainer that stops explaining when the wifi
drops has failed at the moment a player is most likely to be on a train.

**Build-time model generation, shipped as JSON.** Genuinely tempting: it satisfies every
runtime requirement, because the output is still a static table. Rejected for Phase 1 on
reviewability — 300 generated strings are 300 statements about correct play that nobody has
read, and a plausible-sounding wrong rationale in a *teaching* tool is worse than no rationale.
Authored families are small enough to review in full. This is the alternative most worth
revisiting once the family set is stable and a review process exists for the output.

**Composing sentences from fragments at runtime.** Deterministic and offline, so it clears the
hard requirements. Rejected on quality: fragment assembly produces stilted text, and it makes
FR-029 harder to reason about than a literal lookup — you end up proving that a grammar is
total rather than checking that a table has no holes.

**A single generic explanation per action.** "Hitting improves a weak hand." Trivially
complete, and worthless: it does not name the player's total or the dealer's upcard, which is
the entire content of a basic strategy decision.
