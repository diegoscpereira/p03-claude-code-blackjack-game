<!--
Sync Impact Report
==================
Version change: 1.0.0 → 2.0.0
Bump rationale: MAJOR — the technology baseline was replaced and two principles were
redefined. v1.0.0 governed a Python CLI application; feature 001 established that this
project is a hosted web application (React/TypeScript on Vercel, PostgreSQL via Supabase).
Requirements were removed, not merely clarified — most visibly the CLI input mechanics in
Principle III and the "no network calls" rule in Additional Constraints — and the
constitution's own versioning policy classifies removals and redefinitions as MAJOR.

Modified principles:
- I. Code Quality — purity clause restated for this stack: rules modules must not perform
  I/O, touch the DOM, call the network, read the clock, or consume unseeded randomness.
  Intent unchanged; the stdin/stdout phrasing had no meaning here.
- II. Test-First Discipline (NON-NEGOTIABLE) — unchanged in substance. The list of banned
  test dependencies now reads "viewport size, or network availability" in place of
  "terminal size".
- III. User Experience Consistency — REDEFINED. Removed: single-letter input prefixes,
  case-insensitive word parsing, re-prompt-on-invalid-input, stdout/stderr separation.
  Retained: the one action vocabulary, and board state visible at every decision point.
  Added: only legal actions may be offered, no modal may interrupt a hand, keyboard
  operability, WCAG 2.1 AA contrast, and interruptible presentation pacing.
- IV. Performance Discipline — REDEFINED. "Cold start to first prompt < 1s" replaced with
  "first load to interactive table < 2s", aligning with spec NFR-004. Added: no interactive
  path may await the network, and pacing is excluded from the 100ms budget but must remain
  interruptible. The 30-second test budget now scopes to the unit and engine suite;
  end-to-end browser tests are exempt and must stay independently runnable.

Modified sections:
- Additional Constraints — REPLACED WHOLESALE. Python 3.13/`uv`/`src/`+`tests/` layout and
  the offline, local-disk data rule are gone. Now: strict TypeScript, one-directional
  layering with a browser-free testable engine, stateless server-side endpoints, local
  state authoritative during play, server-side-only credentials, and no personal data.
- Development Workflow & Quality Gates — a sixth gate added: no database credential in a
  client bundle or client-visible response.

Unchanged sections:
- Governance (amendment procedure, versioning policy, compliance review)

Templates requiring updates:
- ✅ .specify/templates/plan-template.md (Constitution Check gates rewritten for the web
     stack; Python/uv and CLI vocabulary gates removed)
- ✅ .specify/templates/tasks-template.md (reviewed — tests already REQUIRED per Principle
     II; no stack-specific content to change)
- ✅ .specify/templates/spec-template.md (reviewed — no change required)
- ✅ specs/001-blackjack-ai-trainer/spec.md (Assumption 10 resolved: the deviation it
     recorded no longer exists)
- ✅ specs/001-blackjack-ai-trainer/checklists/requirements.md (constitutional-conflict
     note cleared)
- ⚠ README.md (pending — stub file, no principle references to update yet)

Follow-up TODOs:
- None. No merged code predates this amendment, so nothing is left out of compliance.
-->

# Blackjack Game Constitution

## Core Principles

### I. Code Quality

Game rules MUST be pure and separated from input/output: modules that decide hand values,
legal actions, and payouts MUST NOT perform I/O, touch the DOM, call the network, read the
system clock, or consume an unseeded RNG. All public functions and module-level names MUST
carry type
annotations, and type checking MUST pass with no suppressed errors outside of explicitly
justified, comment-annotated exceptions. Formatting and linting MUST be automated and MUST
pass before a change is considered complete. Dead code, commented-out blocks, and unused
parameters MUST be deleted rather than retained. Any function exceeding 50 lines or any
module exceeding 400 lines MUST be split unless the plan records a justification.

**Rationale**: Blackjack rules are small but full of edge cases (soft aces, splits,
surrender, dealer-hits-soft-17). Keeping them pure makes every rule directly testable and
keeps the correctness surface separate from presentation churn.

### II. Test-First Discipline (NON-NEGOTIABLE)

Tests MUST be written before implementation, MUST be observed to fail, and only then MUST
the implementation be written. Every rule of play MUST have at least one unit test naming
the rule it encodes. Every user-facing round flow MUST have an integration test that drives
the game end to end. Randomness MUST be injectable and seeded in tests; a test that depends
on unseeded randomness, wall-clock time, viewport size, or network availability is a defect
and MUST be fixed, not retried. Line coverage of rules and scoring modules MUST be at least
90%; coverage of
presentation code has no minimum. A failing or skipped test MUST block merge — skips require
an inline reason and a linked follow-up.

**Rationale**: Payout errors are silent and expensive. Test-first is the only cheap way to
prove the dealer, the scorer, and the bankroll agree before anyone plays a hand.

### III. User Experience Consistency

The game MUST use one vocabulary for player actions across controls, help text, error
messages, and documentation: `hit`, `stand`, `double`, `split`, `surrender`. Only the legal
actions for the current hand state MUST be offered; an illegal action MUST be absent or
disabled with a stated reason, never offered and then rejected. Unrecognized or ill-timed
input MUST leave the game in a playable state — never a crash, never a silently discarded
turn. Every error surfaced to a player MUST name what happened and what to do next, and MUST
NOT interrupt a hand in progress with a modal. Board state — dealer upcard, player hand, hand
total, bankroll, and current bet — MUST be visible at every decision point without scrolling.
Every action MUST be operable by keyboard alone, and interactive elements MUST meet WCAG 2.1
AA contrast. Presentation pacing MUST always be interruptible by player input.

**Rationale**: A card game is a conversation. Inconsistent verbs, a control that lies about
what is legal, or an animation that ignores a click breaks trust faster than any missing
feature.

### IV. Performance Discipline

Interactive response MUST feel immediate: the p95 time from player input to rendered result
MUST be under 100ms on the reference environment, and first load to an interactive table MUST
be under 2 seconds on a standard broadband connection. No interactive path MUST await the
network — remote persistence MUST happen off the critical path, and losing connectivity MUST
NOT interrupt a hand in progress. Deliberate presentation pacing is excluded from the 100ms
budget but MUST remain interruptible. The unit and engine test suite MUST complete in under
30 seconds; when it exceeds that, the suite MUST be made faster rather than the budget raised
without amendment. End-to-end browser tests are exempt from that budget and MUST instead be
kept independently runnable so they never gate the fast feedback loop. Memory MUST stay
bounded across arbitrarily long sessions — per-round state MUST NOT accumulate in unbounded
lists or logs. Performance budgets MUST be verified by measurement, not asserted:
any change claiming to affect performance MUST cite before/after numbers. Optimization MUST
NOT be applied speculatively; it requires a measurement showing a budget is at risk.

**Rationale**: These budgets are small enough that meeting them is a design constraint, not
a tuning exercise — and stating them numerically means "fast enough" is decidable rather
than argued.

## Additional Constraints

**Language and runtime**: TypeScript in strict mode, targeting the browser for the client and
the hosting platform's serverless runtime for server-side endpoints. Implicit `any` and
unchecked non-null assertions are type-checker errors, not warnings. The dependency set MUST
stay minimal — each runtime dependency added MUST be justified in the plan against the
platform or standard-library alternative. Development-only tooling (test runner, linter, type
checker, coverage, end-to-end driver) is exempt from that justification.

**Architecture**: The layering is one-directional: the game engine and its models MUST NOT
import from UI, state-store, network, or persistence code. The engine MUST be usable, and
MUST be tested, without a browser. Shuffling and any other nondeterminism MUST be reached
through an injected source with a seedable default. Server-side endpoints MUST be stateless —
no handler may depend on in-memory state surviving between invocations.

**Data**: Local state is authoritative during play; remote persistence is a background
replica. The game MUST remain fully playable — deal, act, settle, advise — with no network
connection after first load. Persistence credentials MUST exist only in server-side
configuration and MUST NOT appear in any client bundle or client-visible response. Stored
records MUST contain no personal information. Reads of stored state MUST tolerate absence,
corruption, or a schema from a previous version without crashing or blocking play.

## Development Workflow & Quality Gates

Every change MUST clear these gates before merge, in order:

1. Formatter and linter pass with zero findings.
2. Type checker passes with zero unjustified errors.
3. Full test suite passes, including the new tests written before the change.
4. Coverage on rules and scoring modules remains at or above 90%.
5. Unit and engine suite wall time remains under 30 seconds.
6. No database credential appears in a client bundle or client-visible response.

Review MUST verify constitutional compliance explicitly, not just correctness — a reviewer
who cannot locate the test that failed first SHOULD reject the change. Any deviation from a
principle MUST be recorded in the plan's Complexity Tracking table with the simpler
alternative that was rejected and why. An undocumented deviation is a defect.

## Governance

This constitution supersedes conflicting practices, habits, and prior conventions. Where a
principle and an existing implementation disagree, the implementation is what changes.

**Amendment procedure**: Amendments MUST be proposed as a written change to this file
stating the principle affected, the rationale, and the migration path for code that the
amendment would put out of compliance. An amendment takes effect when merged; already-merged
code that becomes non-compliant MUST be tracked as follow-up work rather than grandfathered
silently.

**Versioning policy**: This document is versioned with semantic versioning. MAJOR covers
backward-incompatible governance changes — removing or redefining a principle. MINOR covers
a new principle or a materially expanded section. PATCH covers clarifications, wording, and
typo fixes that do not change what is required. Numeric budgets in Principle IV are
normative: changing one is at minimum a MINOR amendment.

**Compliance review**: Compliance is checked at two points — the Constitution Check gate in
every implementation plan, and code review of every change. Reviewers MUST treat an
unexplained gate failure as blocking.

**Version**: 2.0.0 | **Ratified**: 2026-07-26 | **Last Amended**: 2026-07-26
