---

description: "Task list for Web-Based Blackjack AI Trainer"
---

# Tasks: Web-Based Blackjack AI Trainer

**Input**: Design documents from `/specs/001-blackjack-ai-trainer/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/)

**Tests**: REQUIRED. Constitution v2.0.0 Principle II (Test-First, NON-NEGOTIABLE) mandates that test tasks precede the implementation they cover, and that each test is observed failing before the implementation is written.

**Organization**: Tasks are grouped by user story so each story can be implemented, tested, and demoed independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1–US7)
- Paths are repository-root relative

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Scaffold the project and stand up every quality gate before any feature code exists. Gates that arrive late never get enforced.

- [X] T001 Scaffold Vite + React 18 + TypeScript project at the **git repository root** (`jornada_de_dados_claude_code_projeto03/`). Move `.specify/`, `.claude/`, and `specs/` up from `claude_code_blackjack_project/` to that root, delete the Python placeholder scaffold (`main.py`, `pyproject.toml`, `.python-version`), and remove the emptied `claude_code_blackjack_project/` directory. All paths in this file are relative to that root
- [X] T002 Configure strict TypeScript in `tsconfig.json` with `strict`, `noImplicitAny`, `noUncheckedIndexedAccess`, and `noUnusedLocals` enabled
- [X] T003 [P] Install and configure Tailwind CSS in `tailwind.config.ts` and `src/index.css`, defining colour tokens that meet WCAG 2.1 AA contrast
- [X] T004 [P] Configure Vitest in `vite.config.ts` with a Node environment for `tests/unit` and jsdom for `tests/integration`
- [X] T005 [P] Configure V8 coverage in `vite.config.ts` with a hard 90% line threshold scoped to `src/engine/**` and `src/strategy/**`
- [X] T006 [P] Configure Playwright in `playwright.config.ts` with a headless CI project and a separate `test:e2e` script
- [X] T007 Configure ESLint and Prettier in `eslint.config.js`, including the `no-restricted-imports` zone rule forbidding `src/engine/**` and `src/strategy/**` from importing `react`, `zustand`, `src/ui/**`, `src/store/**`, `src/sync/**`, or `@supabase/*` (research.md R6). Also configure `max-lines: 400` and `max-lines-per-function: 50` so constitution Principle I's size caps fail CI rather than relying on review
- [X] T008 Add npm scripts to `package.json`: `dev`, `build`, `typecheck`, `lint`, `test:unit`, `test:integration`, `test:coverage`, `test:e2e`, `generate:ev`, `check:bundle`
- [X] T009 [P] Write `scripts/check-bundle.ts` asserting no `SUPABASE_SERVICE` string or service-key value appears in `dist/`, exiting non-zero on match
- [X] T010 [P] Create `.env.example` and `vercel.json` documenting server-side-only `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` with an explicit note that no `VITE_` prefix may be used
- [X] T011 [P] Create the directory skeleton `src/{engine,strategy,bots,progression,sync,store,ui}`, `api/`, `tests/{unit,integration,e2e}`, `docs/adr/`, `supabase/`
- [X] T012 Create `.github/workflows/ci.yml` running the six constitutional gates in order: typecheck → lint → unit+integration → coverage → check:bundle → e2e (e2e as a separate job)

**Checkpoint**: `npm run typecheck && npm run lint` passes on an empty project; CI is green.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared vocabulary, the seeded RNG, and the test helpers every story depends on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T013 Define shared types in `src/engine/types.ts`: `Rank`, `Suit`, `Card`, `Action`, `Outcome`, `Hand`, `RoundState`, `Decision`, `Rng`, `HouseRules` per [contracts/engine-api.md](./contracts/engine-api.md). `Action` is the single source of the action vocabulary — no other module may redefine it (Principle III)
- [X] T014 Define the Phase 1 house rules constant in `src/engine/rules-config.ts`: 6 decks, dealer hits soft 17, 3:2 naturals, double after split, max 4 hands, no surrender, 0.75 penetration (spec Assumption 1)
- [X] T015 Write failing determinism test in `tests/unit/engine/rng.test.ts` asserting `createRng(n)` produces identical sequences across repeated calls and across process runs
- [X] T016 Implement the seeded PRNG in `src/engine/rng.ts` behind the `Rng` interface (research.md R2). `Math.random` must not appear
- [X] T017 [P] Write test helpers in `tests/helpers/scripted-rng.ts` providing an `Rng` that returns a scripted sequence, so tests can force specific hands without seed-hunting
- [X] T018 [P] Write test helpers in `tests/helpers/hands.ts` for building `Hand` and `RoundState` fixtures from shorthand like `'A,6'`
- [X] T019 [P] Write the reference basic strategy chart fixture in `tests/fixtures/basic-strategy.ts` for the T014 rule set, to be used as the test oracle for FR-021 and SC-003
- [X] T020 Verify the ESLint boundary rule actually fails by temporarily adding a `react` import to `src/engine/types.ts`, confirming the error, then removing it

**Checkpoint**: Foundation ready — user stories can begin.

---

## Phase 3: User Story 1 - Play a complete, correct hand of Blackjack (Priority: P1) 🎯 MVP

**Goal**: A playable single-player Blackjack game with correct rules and settlement. No AI, no tutorial, no persistence.

**Independent Test**: Deal a seeded shoe, play a hand through each of Hit, Stand, Double, and Split, and verify the settled bankroll matches the expected payout for that seed.

### Tests for User Story 1 (REQUIRED - write first) ⚠️

> Write these FIRST and observe them FAIL before implementing.

- [X] T021 [P] [US1] Unit test hand totals and soft/hard aces in `tests/unit/engine/hand.test.ts`, covering the table in contracts/engine-api.md (FR-001)
- [X] T022 [P] [US1] Unit test shoe construction, Fisher–Yates shuffle, draw, and penetration in `tests/unit/engine/shoe.test.ts` (FR-016)
- [X] T023 [P] [US1] Unit test `legalActions` for every phase and hand shape in `tests/unit/engine/rules.test.ts`, including double-without-bankroll and the 4-hand split cap (FR-002, FR-010)
- [X] T024 [P] [US1] Unit test round reducer transitions for Hit, Stand, and Double in `tests/unit/engine/round.test.ts`, asserting input state is never mutated (FR-006, FR-007, FR-008)
- [X] T025 [P] [US1] Unit test split, resplit to the 4-hand cap, and split-Ace one-card-and-stand in `tests/unit/engine/split.test.ts` (FR-009, FR-010, FR-011)
- [X] T026 [P] [US1] Unit test dealer play drawing to hard 17 and hitting soft 17 in `tests/unit/engine/dealer.test.ts` (FR-012)
- [X] T027 [P] [US1] Unit test settlement in `tests/unit/engine/settle.test.ts`: 3:2 naturals, 1:1 wins, pushes, busts, and the invariant that per-hand payouts sum to the round total (FR-013)
- [X] T028 [P] [US1] Unit test that an illegal action returns the state unchanged rather than throwing, in `tests/unit/engine/rules.test.ts` (FR-015, contracts/engine-api.md totality rule)
- [X] T029 [P] [US1] Unit test full-round determinism from a fixed seed in `tests/unit/engine/determinism.test.ts` (FR-004, SC-008)
- [X] T030 [US1] Integration test driving a complete round through the store in `tests/integration/round-loop.test.ts`: bet → deal → actions → dealer → settle → bankroll updated

### Implementation for User Story 1

- [X] T031 [P] [US1] Implement `handTotal`, `isBust`, and `isNatural` in `src/engine/hand.ts`
- [X] T032 [P] [US1] Implement shoe build, shuffle, draw, and penetration check in `src/engine/shoe.ts`
- [X] T033 [US1] Implement `legalActions` in `src/engine/rules.ts` (depends on T031)
- [X] T034 [US1] Implement `startRound` and `applyAction` reducer in `src/engine/round.ts` (depends on T031, T032, T033)
- [X] T035 [US1] Implement `playDealer` in `src/engine/dealer.ts` (depends on T031)
- [X] T036 [US1] Implement `settle` and `SettledRound` emission including the hand log record in `src/engine/settle.ts` (FR-014)
- [X] T037 [US1] Implement the Zustand store in `src/store/gameStore.ts` holding `RoundState`, bankroll, and bet, with actions dispatching to the engine reducer
- [X] T038 [P] [US1] Build the `Card` component in `src/ui/table/Card.tsx` with a face-down state for the dealer hole card
- [X] T039 [P] [US1] Build the `Hand` component in `src/ui/table/Hand.tsx` showing cards and the derived total
- [X] T040 [US1] Build the `Controls` component in `src/ui/table/Controls.tsx` rendering only `legalActions`, disabling unavailable actions with a stated reason (FR-002, Principle III)
- [X] T041 [P] [US1] Build the `Bankroll` and bet controls in `src/ui/table/Bankroll.tsx`, including the zero-bankroll reset offer (FR-055)
- [X] T042 [US1] Build the `Table` component in `src/ui/table/Table.tsx` composing hands, dealer, controls, and bankroll so all board state is visible at every decision point (Principle III)
- [X] T043 [US1] Wire `src/App.tsx` and `src/main.tsx` to render the table and start a round
- [X] T044 [US1] Add deal/draw animation as cancellable pacing in `src/ui/table/Table.tsx`, excluded from the 100ms budget but interruptible by input (NFR-001, Principle IV)
- [X] T045 [US1] End-to-end test playing a full hand in `tests/e2e/play-hand.spec.ts` (quickstart V1)

**Checkpoint**: A playable, correct Blackjack game. This is the MVP — stop and validate here.

---

## Phase 4: User Story 2 - Skip the tutorial and go straight to the table (Priority: P1)

**Goal**: An experienced player dismisses onboarding in one action and reaches a live hand within seconds, with nothing gated behind the tutorial.

**Independent Test**: Load as a first-time visitor, dismiss the offer, confirm a hand is playable and every feature is available. Reload and confirm the offer does not return.

### Tests for User Story 2 (REQUIRED - write first) ⚠️

- [X] T046 [P] [US2] Unit test tutorial state persistence in `tests/unit/tutorial-state.test.ts`: dismissed, completed, and `lastStep` round-trip through `localStorage` (FR-043, FR-046)
- [X] T047 [P] [US2] Component test in `tests/integration/tutorial-offer.test.tsx` asserting the dismiss control is present, keyboard-reachable, and requires no confirmation (FR-041, FR-042)
- [X] T048 [US2] End-to-end test in `tests/e2e/tutorial-skip.spec.ts` covering dismiss-in-one-interaction, no reappearance after reload, and all features unlocked (SC-002, SC-009)

### Implementation for User Story 2

- [X] T049 [P] [US2] Implement tutorial state read/write in `src/ui/tutorial/tutorialState.ts` backed by the `bj.tutorial` localStorage key (data-model.md Part 3)
- [X] T050 [US2] Build the `TutorialOffer` component in `src/ui/tutorial/TutorialOffer.tsx` with a dismiss control visible without scrolling and reachable by keyboard (FR-040, FR-041)
- [X] T051 [US2] Wire dismissal in `src/store/gameStore.ts` to exit immediately to the live table with no confirmation and no intermediate screen (FR-042)
- [X] T052 [P] [US2] Add a help menu entry in `src/ui/common/HelpMenu.tsx` making the tutorial available on demand at any time (FR-044)
- [X] T053 [US2] Audit every feature surface for tutorial gating and confirm none exists, recording the check in `tests/e2e/tutorial-skip.spec.ts` (FR-045)

**Checkpoint**: Both P1 stories complete. The product is viable for experienced players.

---

## Phase 5: User Story 3 - Learn Blackjack through the guided tutorial (Priority: P2)

**Goal**: A beginner is walked through card values, soft versus hard totals, dealer rules, and the four actions, and exits able to play unaided.

**Independent Test**: Run the tutorial start to finish and confirm each lesson step gates on the correct action and explains why it was correct.

### Tests for User Story 3 (REQUIRED - write first) ⚠️

- [X] T054 [P] [US3] Unit test lesson sequencing and step advancement in `tests/unit/tutorial-steps.test.ts`
- [X] T055 [P] [US3] Component test in `tests/integration/tutorial-step.test.tsx` asserting the taught action is highlighted and a reason is shown (FR-047)
- [X] T056 [US3] End-to-end test in `tests/e2e/tutorial-complete.spec.ts` covering full completion and mid-tutorial resume from the help menu (FR-046)

### Implementation for User Story 3

- [X] T057 [P] [US3] Define the fixed linear lesson sequence in `src/ui/tutorial/lessons.ts`: card values, hand totals, soft vs hard, dealer rules, and each of the four actions (spec Assumption 6)
- [X] T058 [US3] Implement the guided-hand runner in `src/ui/tutorial/TutorialRunner.tsx` using scripted seeds so each lesson deals a predetermined hand
- [X] T059 [US3] Implement step highlighting and rationale display in `src/ui/tutorial/LessonStep.tsx` (FR-047)
- [X] T060 [US3] Implement resume-from-last-completed-step on re-entry in `src/ui/tutorial/tutorialState.ts` (FR-046)
- [X] T061 [US3] Ensure the dismiss control appears on every tutorial surface, not just the offer (FR-041, SC-009)

**Checkpoint**: Beginners can learn; experienced players remain unblocked.

---

## Phase 6: User Story 4 - Get real-time strategy advice and understand it (Priority: P2)

**Goal**: Every legal action shown with its expected value, a marked recommendation, and a plain-language explanation — all resolved locally and instantly.

**Independent Test**: Present textbook decision points (16 vs 10, A-7 vs 9, 8-8 vs 10) and verify ranked EVs and recommendations match the published chart for the configured rules.

### Tests for User Story 4 (REQUIRED - write first) ⚠️

- [X] T062 [P] [US4] Unit test the EV generator against published EV figures for the T014 rule set in `tests/unit/strategy/ev-generator.test.ts` — a mismatch is a generator bug, never a chart disagreement (research.md R1)
- [X] T063 [P] [US4] Table-driven unit test in `tests/unit/strategy/chart.test.ts` asserting `recommend()` matches the T019 reference chart at **every** charted decision point, not a sample (FR-021, SC-003)
- [X] T064 [P] [US4] Unit test in `tests/unit/strategy/ev.test.ts` asserting `rankActions` returns one entry per legal action, sorted descending, with `recommend()` equal to the top entry
- [X] T065 [P] [US4] Unit test explanation coverage in `tests/unit/strategy/explanations.test.ts` asserting 100% of charted decision points resolve to an entry, and that repeated lookups return identical text (FR-028, FR-029, SC-010)
- [X] T066 [P] [US4] Unit test that `explain()` returns `null` rather than placeholder text for an unmatched key (FR-027)
- [X] T067 [US4] Component test in `tests/integration/companion.test.tsx` asserting a non-recommended action proceeds without blocking and shows the EV difference (FR-025)

### Implementation for User Story 4

- [X] T068 [US4] Write the exact EV solver in `scripts/generate-ev-tables.ts` computing dealer outcome probabilities and per-action EV for every player shape and dealer upcard (research.md R1)
- [X] T069 [US4] Generate `src/strategy/data/ev-tables.json` via `npm run generate:ev` and verify size stays within the first-load budget (~40KB, NFR-004)
- [X] T070 [P] [US4] Implement the basic strategy lookup in `src/strategy/chart.ts`
- [X] T071 [US4] Implement `rankActions` and `recommend` in `src/strategy/ev.ts` as synchronous table lookups with no computation and no await (NFR-002)
- [X] T072 [US4] Author explanation rationale families and expand across the chart into `src/strategy/data/explanations.json` (research.md R7)
- [X] T073 [US4] Implement `explain()` lookup in `src/strategy/explanations.ts` keyed by hand shape, dealer upcard, and action (FR-023)
- [X] T074 [US4] Build the companion panel in `src/ui/companion/CompanionPanel.tsx` listing each legal action with its EV and marking the recommendation (FR-022)
- [X] T075 [P] [US4] Build the explanation display in `src/ui/companion/Explanation.tsx`, rendering nothing when `explain()` returns `null` (FR-027)
- [X] T076 [US4] Record `Decision` entries in `src/store/gameStore.ts` on every player action, excluding automatic split-Ace stands (FR-024, FR-024a)
- [X] T077 [P] [US4] Add a companion-disabled setting that still records match data but hides advice (FR-026)
- [X] T078 [P] [US4] Write ADR in `docs/adr/0001-precomputed-ev-tables.md` recording the decision and the rejected runtime solver

**Checkpoint**: The differentiating feature works and is provably correct against the chart.

---

## Phase 7: User Story 5 - Share the table with AI bots (Priority: P3)

**Goal**: Two contrasting bot personalities play their own hands automatically with visible, skippable pacing.

**Independent Test**: Seat two bots with different profiles, run twenty seeded rounds, and confirm each bot's action log is consistent with its profile and needs no player input.

### Tests for User Story 5 (REQUIRED - write first) ⚠️

- [ ] T079 [P] [US5] Unit test bot decision reproducibility from a seed in `tests/unit/bots/decide.test.ts` (FR-031)
- [ ] T080 [P] [US5] Unit test that the Conservative Math profile takes the basic-strategy action and the Aggressive High-Roller deviates consistently with its documented profile, in `tests/unit/bots/profiles.test.ts` (FR-032)
- [ ] T081 [P] [US5] Unit test that bot outcomes never alter player bankroll, XP, or statistics, in `tests/unit/bots/isolation.test.ts` (FR-035)
- [ ] T082 [US5] Integration test in `tests/integration/bot-pacing.test.tsx` asserting turns collapse on input and the collapsed outcome equals the un-collapsed outcome (FR-036, FR-037)

### Implementation for User Story 5

- [ ] T083 [P] [US5] Define the two bot profiles in `src/bots/profiles.ts` with documented decision rules (FR-032, spec Assumption 5)
- [ ] T084 [US5] Implement `decide(profile, state, rng)` in `src/bots/decide.ts` (depends on T083, T071)
- [ ] T085 [US5] Add bot seats to `RoundState` handling in `src/engine/round.ts`, keeping bot settlement separate from player settlement (FR-035)
- [ ] T086 [US5] Build the `BotSeat` component in `src/ui/table/BotSeat.tsx` labelling each action with the bot's name (FR-033)
- [ ] T087 [US5] Implement the 600ms cancellable turn timer in `src/store/gameStore.ts`, disabling player controls during bot turns (FR-033, FR-034)
- [ ] T088 [US5] Implement turn collapse on any player input, consuming that input rather than applying it to the player's hand (FR-036, spec Edge Cases)

**Checkpoint**: The table feels populated and the playstyle contrast is visible.

---

## Phase 8: User Story 6 - Keep progression across sessions (Priority: P3)

**Goal**: XP, levels, unlocks, and lifetime statistics survive across sessions, synced in the background without ever blocking play.

**Independent Test**: Play several hands, note XP and stats, reload, and confirm values are restored; verify a level-up announcement when crossing a threshold.

### Tests for User Story 6 (REQUIRED - write first) ⚠️

- [ ] T089 [P] [US6] Unit test XP awards in `tests/unit/progression/xp.test.ts`: 10 per hand plus 2 per matched decision, awarded regardless of win or loss (FR-050)
- [ ] T090 [P] [US6] Unit test the level ladder in `tests/unit/progression/levels.test.ts`: each threshold, multi-level crossing from a single award, and the level-10 ceiling (FR-051, FR-051d, FR-051e)
- [ ] T091 [P] [US6] Unit test EV accuracy derivation from the two counters, including the unavailable state at zero decisions, in `tests/unit/progression/accuracy.test.ts` (FR-024a, FR-024b)
- [ ] T092 [P] [US6] Unit test outbox enqueue, localStorage durability across a simulated reload, backoff, and the 500-record cap in `tests/unit/sync/outbox.test.ts` (FR-062, research.md R5)
- [ ] T092a [P] [US6] Unit test local-state resilience in `tests/unit/sync/corruption.test.ts`: malformed JSON, a truncated write, and an unknown schema version in `bj.outbox`, `bj.tutorial`, and `bj.player_id` are each discarded and replaced with defaults rather than throwing, and the app still reaches a playable table (constitution Additional Constraints)
- [ ] T093 [P] [US6] Integration test asserting a retried write produces exactly one hand log and no double-counted counter, in `tests/integration/outbox-idempotency.test.ts` (FR-071)
- [ ] T094 [P] [US6] Integration test reconciliation in `tests/integration/reconciliation.test.ts`: counters take the higher value, unlocks union, bankroll takes local (spec boundary rule 4)
- [ ] T095 [P] [US6] Contract test for `GET`/`PUT /api/progress` in `tests/integration/api-progress.test.ts`, including 404-is-not-an-error for a new player (contracts/http-api.md, FR-066)
- [ ] T096 [P] [US6] Contract test for `POST /api/hands` in `tests/integration/api-hands.test.ts`, including batch rejection with no partial writes (FR-070)
- [ ] T096a [P] [US6] Contract test for endpoint scoping in `tests/integration/api-scoping.test.ts`: a request omitting `player_id` returns 400; a request cannot address another player's row via any other parameter; responses never contain a `player_id` other than the one requested (FR-069). Also assert handlers hold no module-scope mutable state — two sequential requests with different `player_id` values return correctly scoped results with no bleed-through (NFR-005)
- [ ] T097 [US6] End-to-end offline test in `tests/e2e/offline.spec.ts`: hand completes offline with no error, indicator appears, results sync on reconnect (SC-006)

### Implementation for User Story 6

- [ ] T098 [P] [US6] Implement XP award rules in `src/progression/xp.ts` (FR-050)
- [ ] T099 [P] [US6] Implement the 10-level ladder and unlock mapping in `src/progression/levels.ts` (FR-051d)
- [ ] T100 [P] [US6] Implement player identity creation and retrieval in `src/sync/identity.ts` using the `bj.player_id` key (FR-053, FR-066)
- [ ] T101 [US6] Implement the durable outbox in `src/sync/outbox.ts`: synchronous enqueue, background drain, exponential backoff with jitter, 500-record cap (FR-061, FR-062, research.md R5)
- [ ] T102 [US6] Implement the fetch wrapper in `src/sync/client.ts` targeting `/api` endpoints only (FR-068)
- [ ] T103 [P] [US6] Write `supabase/schema.sql` creating `user_progress` and `hand_logs` with the columns, checks, and index in data-model.md, and no RLS policies (FR-065)
- [ ] T103a [P] [US6] Schema assertion test in `tests/integration/schema-shape.test.ts` enumerating the exact allowed columns of `user_progress` and `hand_logs`, failing if any column outside that list exists — so a later migration cannot quietly introduce personal data (FR-054)
- [ ] T104 [US6] Implement `api/progress.ts` with `GREATEST` merge semantics for counters, array union for unlocks, and incoming values for level and bankroll (contracts/http-api.md, research.md R4). Reject with 400 when `player_id` is absent, and scope every query by it (FR-069)
- [ ] T105 [US6] Implement `api/hands.ts` with `INSERT … ON CONFLICT (hand_id) DO NOTHING` and a 50-record batch limit (FR-071). Scope every insert by `player_id` and reject batches without it (FR-069)
- [ ] T106 [US6] Apply progression optimistically in `src/store/gameStore.ts` on settlement: XP, `hands_played`, `wins`, `losses`, `pushes`, `net_bankroll_change`, `decisions_taken`, and `decisions_matched`, enqueueing to the outbox without awaiting (FR-052, FR-060, FR-061)
- [ ] T107 [US6] Implement session-start restore in `src/store/gameStore.ts`, flushing queued records before restoring, and beginning play before any persistence call completes (FR-064, FR-066)
- [ ] T108 [P] [US6] Build the passive `SyncIndicator` component in `src/ui/common/SyncIndicator.tsx` — never a modal, never a blocked control (FR-063, Principle III)
- [ ] T109 [P] [US6] Build the level-up announcement in `src/ui/common/LevelUp.tsx`, granting unlocks without a reload (FR-051)
- [ ] T110 [P] [US6] Build locked and unlocked guide views in `src/ui/guides/`, rendering charts from the same strategy source the companion uses (FR-051a, FR-051b, FR-051c)
- [ ] T111 [P] [US6] Build the post-game analysis view in `src/ui/guides/PostGameAnalysis.tsx` reading hand logs (FR-067)
- [ ] T112 [P] [US6] Write ADR in `docs/adr/0002-no-rls-server-side-proxy.md` recording the access-path decision and its accepted exposure bound

**Checkpoint**: All seven functional stories complete; progression survives sessions.

---

## Phase 9: User Story 7 - Review the architecture as an SDD artifact (Priority: P3)

**Goal**: A reviewer can clone, run the tests, replay a hand from its seed, and trace a requirement to the test that proves it.

**Independent Test**: From a clean clone, run the suite and reproduce a specific recorded hand outcome from its seed alone.

### Tests for User Story 7 (REQUIRED - write first) ⚠️

- [ ] T113 [P] [US7] Test replaying a recorded hand log from its seed and action list in `tests/unit/engine/replay.test.ts`, asserting identical cards and settlement every run (SC-008)
- [ ] T114 [P] [US7] Lint rule test in `tests/unit/architecture.test.ts` asserting no file under `src/engine` or `src/strategy` imports React, the store, sync, or network APIs (Principle I)

### Implementation for User Story 7

- [ ] T115 [US7] Implement `replayRound(seed, actions)` in `src/engine/replay.ts` reconstructing a round from a hand log (FR-014, FR-067)
- [ ] T116 [US7] Add requirement identifiers to test names across `tests/unit/` so each test states the FR or SC it covers (User Story 7 acceptance scenario 2)
- [ ] T117 [P] [US7] Write `README.md`: what it is, screenshot, live link, architecture diagram, 30-second start, "how the EV engine works", and an SDD section linking to `specs/001-blackjack-ai-trainer/`
- [ ] T118 [P] [US7] Write `docs/architecture.md` expanding the plan's three diagrams with the layering rationale
- [ ] T119 [P] [US7] Write ADR in `docs/adr/0003-template-explanations.md` recording decision D1 and the rejected runtime LLM approach
- [ ] T120 [P] [US7] Write ADR in `docs/adr/0004-device-scoped-identity.md` recording the accepted loss of progression on storage clear
- [ ] T121 [P] [US7] Add CI and coverage badges to `README.md`, both wired to real workflow runs

**Checkpoint**: The repository reads as a portfolio artifact, not just working code.

---

## Phase 10: Polish & Cross-Cutting Concerns

- [ ] T122 [P] Keyboard-only end-to-end test through a complete hand in `tests/e2e/keyboard.spec.ts` (NFR-008)
- [ ] T123 [P] Contrast audit against WCAG 2.1 AA across all surfaces, recorded in `tests/e2e/contrast.spec.ts` (NFR-008)
- [ ] T124 [P] Responsive verification from 360px to 1920px with no horizontal scrolling, in `tests/e2e/responsive.spec.ts` (NFR-010)
- [ ] T125 Measure and record against budget: p95 input→render (NFR-001, 100ms), first-load-to-interactive (NFR-004, 2s), background write round trip (NFR-003, 300ms p95 from an edge region), and time from hand settlement to visibility in post-game analysis (SC-005, 5s at 95%). Record actual numbers in `docs/architecture.md` — Principle IV requires measurement, not assertion
- [ ] T126 [P] Verify bounded memory across a 500-hand session, asserting no unbounded growth in round state or logs (Principle IV)
- [ ] T127 [P] Add the two-tab concurrency test in `tests/integration/two-tabs.test.ts`: shared identity, later write wins for counters, both tabs' hand logs retained (spec Edge Cases)
- [ ] T128 Verify `npm run check:bundle` fails when a credential is deliberately introduced, then confirm it passes on a clean build (constitution Data Safety gate)
- [ ] T129 [P] Run the full quickstart validation suite V1–V9 from `quickstart.md` on a clean clone
- [ ] T130 Deploy to Vercel with server-side environment variables and confirm the live deployment passes V5 (offline) and V9 (bundle scan)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup — **BLOCKS all user stories**
- **US1 (Phase 3)**: Depends on Foundational. Blocks US4, US5, US6 (they need a working engine)
- **US2 (Phase 4)**: Depends on Foundational only — can run parallel to US1
- **US3 (Phase 5)**: Depends on US2 (tutorial shell) and US1 (hands to teach with)
- **US4 (Phase 6)**: Depends on US1 (engine state to advise on)
- **US5 (Phase 7)**: Depends on US1 and US4 (bots use the strategy module)
- **US6 (Phase 8)**: Depends on US1; needs US4 for the decision-match counters
- **US7 (Phase 9)**: Depends on US1; richer once all stories land
- **Polish (Phase 10)**: Depends on all desired stories

### Critical path

`Setup → Foundational → US1 → US4 → US6`. US4 sits on the critical path despite being P2, because both bots (US5) and the EV accuracy score (US6) consume the strategy module. The EV generator (T068) is the single highest-risk task in the project — schedule it early within US4 rather than late.

### Within each user story

- Tests MUST be written and observed failing before implementation
- Types before engine modules; engine before store; store before UI
- `src/engine` before `src/strategy` before `src/bots`
- Story complete before moving to the next priority

### Parallel opportunities

- All of T003–T006 and T009–T011 in Setup
- T017–T019 in Foundational
- All eight US1 test tasks (T021–T029) — different files, no shared state
- T031 and T032 (hand and shoe are independent)
- T038, T039, T041 (independent components)
- All six US4 test tasks (T062–T067)
- All four US5 test tasks (T079–T082)
- Nine of the US6 test tasks (T089–T096)
- Most of Phase 10

---

## Parallel Example: User Story 1

```bash
# All US1 tests together — they must all fail before any implementation starts:
Task: "Unit test hand totals in tests/unit/engine/hand.test.ts"
Task: "Unit test shoe in tests/unit/engine/shoe.test.ts"
Task: "Unit test legalActions in tests/unit/engine/rules.test.ts"
Task: "Unit test round reducer in tests/unit/engine/round.test.ts"
Task: "Unit test split rules in tests/unit/engine/split.test.ts"
Task: "Unit test dealer play in tests/unit/engine/dealer.test.ts"
Task: "Unit test settlement in tests/unit/engine/settle.test.ts"
Task: "Unit test determinism in tests/unit/engine/determinism.test.ts"

# Then the two independent engine modules:
Task: "Implement hand.ts"
Task: "Implement shoe.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1: Setup — every gate stood up before feature code
2. Phase 2: Foundational — types, seeded RNG, test helpers
3. Phase 3: User Story 1 — a correct, playable game
4. **STOP and VALIDATE**: quickstart V1 and V4
5. Deploy if ready — a working Blackjack game is already demoable

### Incremental delivery

1. Setup + Foundational → foundation ready
2. **+ US1** → playable game (MVP)
3. **+ US2** → experienced players unblocked; both P1 stories done
4. **+ US4** → the differentiating feature; critical path cleared
5. **+ US3** → beginners served
6. **+ US5** → the table feels alive
7. **+ US6** → progression persists
8. **+ US7 + Polish** → portfolio-ready

Each step is independently demoable and adds value without breaking what came before.

### Suggested PR boundaries

One PR per phase, titled by user story, so the git history reads as increments — which User Story 7 explicitly asks the repository to demonstrate.

---

## Notes

- **[P]** tasks touch different files and have no incomplete dependencies
- Constitution v2.0.0 Principle II is non-negotiable: observe every test fail before implementing
- The 90% coverage threshold on `src/engine` and `src/strategy` is a CI gate, not a target
- The unit and integration suite must stay under 30 seconds; Playwright is exempt and runs as a separate job
- Commit after each task or logical group; stop at any checkpoint to validate a story independently
