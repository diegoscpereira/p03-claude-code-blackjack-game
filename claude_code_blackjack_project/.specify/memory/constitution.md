<!--
Sync Impact Report
==================
Version change: (unfilled template) → 1.0.0
Bump rationale: MAJOR — initial ratification. The file was still the unpopulated
template; adopting concrete, binding principles is a new governance baseline.

Modified principles:
- [PRINCIPLE_1_NAME] → I. Code Quality (added)
- [PRINCIPLE_2_NAME] → II. Test-First Discipline (NON-NEGOTIABLE) (added)
- [PRINCIPLE_3_NAME] → III. User Experience Consistency (added)
- [PRINCIPLE_4_NAME] → IV. Performance Discipline (added)
- [PRINCIPLE_5_NAME] → removed (user scoped the constitution to four principle areas)

Added sections:
- Additional Constraints (technology and architecture baseline)
- Development Workflow & Quality Gates
- Governance (amendment procedure, versioning policy, compliance review)

Removed sections:
- Placeholder slot [SECTION_2_NAME] / [SECTION_3_NAME] replaced with named sections
- Fifth principle slot (intentionally dropped, see above)

Templates requiring updates:
- ✅ .specify/templates/plan-template.md (Constitution Check gates populated)
- ✅ .specify/templates/tasks-template.md (tests promoted from OPTIONAL to REQUIRED)
- ✅ .specify/templates/spec-template.md (reviewed — Success Criteria already carry
     measurable UX/performance outcomes; no change required)
- ✅ .claude/skills/speckit-*/SKILL.md (reviewed — generic agent-neutral guidance, no
     outdated agent-specific references)
- ⚠ README.md (pending — stub file, no principle references to update yet)

Follow-up TODOs:
- None. Ratification date set to the date of first adoption (2026-07-26).
-->

# Blackjack Game Constitution

## Core Principles

### I. Code Quality

Game rules MUST be pure and separated from input/output: modules that decide hand values,
legal actions, and payouts MUST NOT read from stdin, write to stdout, or call the system
clock or an unseeded RNG. All public functions and module-level names MUST carry type
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
on unseeded randomness, wall-clock time, or terminal size is a defect and MUST be fixed, not
retried. Line coverage of rules and scoring modules MUST be at least 90%; coverage of
presentation code has no minimum. A failing or skipped test MUST block merge — skips require
an inline reason and a linked follow-up.

**Rationale**: Payout errors are silent and expensive. Test-first is the only cheap way to
prove the dealer, the scorer, and the bankroll agree before anyone plays a hand.

### III. User Experience Consistency

The game MUST use one vocabulary for player actions across prompts, help text, error
messages, and documentation: `hit`, `stand`, `double`, `split`, `surrender`. Every prompt
MUST state its accepted inputs. Input handling MUST accept case-insensitive full words and
their unambiguous single-letter prefixes, and MUST treat unrecognized input as a re-prompt,
never as a crash or a silently discarded turn. Invalid input MUST produce an error that
names what was received and what was expected. Normal game output MUST go to stdout and
diagnostics to stderr. Board state — dealer upcard, player hand, hand total, bankroll, and
current bet — MUST be visible at every decision point without the player scrolling back.

**Rationale**: A card game is a conversation. Inconsistent verbs or a prompt that eats a
keystroke breaks trust faster than any missing feature.

### IV. Performance Discipline

Interactive response MUST feel immediate: the p95 time from player input to rendered result
MUST be under 100ms on the reference environment, and cold start to first prompt MUST be
under 1 second. The full test suite MUST complete in under 30 seconds; when it exceeds that,
the suite MUST be made faster rather than the budget raised without amendment. Memory MUST
stay bounded across arbitrarily long sessions — per-round state MUST NOT accumulate in
unbounded lists or logs. Performance budgets MUST be verified by measurement, not asserted:
any change claiming to affect performance MUST cite before/after numbers. Optimization MUST
NOT be applied speculatively; it requires a measurement showing a budget is at risk.

**Rationale**: These budgets are small enough that meeting them is a design constraint, not
a tuning exercise — and stating them numerically means "fast enough" is decidable rather
than argued.

## Additional Constraints

**Language and runtime**: Python 3.13 or newer, managed with `uv`. The dependency set MUST
stay minimal — each runtime dependency added MUST be justified in the plan against the
standard library alternative. Development-only tooling (test runner, linter, type checker,
coverage) is exempt from that justification.

**Architecture**: Source lives under `src/`, tests under `tests/` split into `unit/` and
`integration/`. The layering is one-directional: rules and models MUST NOT import from the
CLI or presentation layer. Shuffling and any other nondeterminism MUST be reached through an
injected source with a seedable default.

**Data**: The game MUST run fully offline with no network calls. Persisted state, if any, is
plain-text or JSON on local disk and MUST tolerate absence, corruption, or a schema from a
previous version without crashing.

## Development Workflow & Quality Gates

Every change MUST clear these gates before merge, in order:

1. Formatter and linter pass with zero findings.
2. Type checker passes with zero unjustified errors.
3. Full test suite passes, including the new tests written before the change.
4. Coverage on rules and scoring modules remains at or above 90%.
5. Test suite wall time remains under 30 seconds.

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

**Version**: 1.0.0 | **Ratified**: 2026-07-26 | **Last Amended**: 2026-07-26
