# Feature Specification: Web-Based Blackjack AI Trainer

**Feature Branch**: `001-blackjack-ai-trainer`

**Created**: 2026-07-26

**Status**: Draft

**Input**: User description: "Create a feature specification for a modern web-based Blackjack game designed to showcase AI concepts, modern web hosting, and Spec-Driven Development (SDD) best practices."

---

## Technical Context

This section is included at the requester's explicit direction. It is binding context for
planning, not a substitute for the technology-agnostic requirements below.

| Concern | Decision |
|---|---|
| Hosting & deployment | Vercel — static frontend plus serverless API routes |
| Persistence | Supabase (PostgreSQL) for player stats, progression, and hand logs |
| Frontend | React + TypeScript, Tailwind CSS, lightweight store (Zustand or equivalent) |
| Game engine | Pure, deterministic state-transition module with no I/O and injected randomness |
| Data access rule | **Lean by design.** No Row Level Security policies, no multi-tenant permission model. Flat tables filtered by a client-generated player UUID. |
| Data access path | Browser → own serverless API routes → database. The privileged database credential is held server-side only; the browser never holds it. |

**Consequence of the lean data rule**: the player UUID is a bearer identifier, not a
credential. Anyone who learns a UUID can read and write that player's row. This is accepted
for a play-money demo carrying no personal data, and it is why FR-054 forbids storing
personal information. It is recorded here so the trade-off is a decision rather than an
oversight.

Routing all access through server-side endpoints (FR-068) does not make the UUID a
credential, but it does bound the exposure: without a browser-held database key there is no
way to enumerate or bulk-read other players, so an attacker is limited to identifiers they
already possess. That is the security posture this feature claims — no more.

---

## Clarifications

### Session 2026-07-26

- Q: How is the "EV accuracy score" defined? → A: Lifetime match rate — the percentage of
  decisions where the player chose the recommended (highest-EV) action
- Q: Do clients write to the database directly, or through serverless API routes? → A:
  Through serverless API routes; the privileged database credential never reaches the browser
- Q: What does an "unlocked strategy guide" contain? → A: Views over data the engine already
  computes — strategy charts and the post-game analysis view; no newly authored prose
- Q: What is the XP curve and how many levels are there? → A: A short fixed ladder of 10
  levels with published thresholds; 10 XP per settled hand plus 2 XP per decision matching
  the recommendation
- Q: How long is a bot's turn window? → A: A fixed 600 ms per bot action, collapsible to
  instant by any player input

---

## User Scenarios & Testing *(mandatory)*

### Personas

- **Bea — the beginner.** Has watched Blackjack in films, has never played. Cannot yet read
  a hand total reliably. Wants to be taught, not tested.
- **Alex — the experienced player.** Knows basic strategy cold. Arrived to see whether the
  AI companion's EV numbers are actually correct. Will abandon the product if forced
  through a tutorial.
- **Ravi — the technical reviewer.** Evaluating the repository as a Spec-Driven Development
  artifact. Wants to trace a rule in this spec to a test to an implementation, and to run
  the engine deterministically.

---

### User Story 1 - Play a complete, correct hand of Blackjack (Priority: P1)

A player sits at the table, places a play-money bet, receives two cards, sees the dealer's
upcard, and plays their hand to resolution using Hit, Stand, Double Down, or Split. The
dealer then plays by fixed house rules and the hand settles, adjusting the player's
bankroll.

**Why this priority**: Without a correct, complete hand of Blackjack there is nothing for
the AI companion to advise on, nothing for bots to sit beside, and nothing for the tutorial
to teach. Every other story depends on this one.

**Independent Test**: Deal a seeded shoe, play a hand through each of the four actions, and
verify the settled bankroll matches the expected payout for that seed. Delivers a playable
single-player Blackjack game with no AI, no tutorial, and no persistence.

**Acceptance Scenarios**:

1. **Given** a player with a bankroll and a placed bet, **When** the hand is dealt, **Then**
   the player sees two face-up player cards, one dealer upcard, one dealer hole card face
   down, and the correct hand total.
2. **Given** a player hand totalling 12 against a dealer 10 upcard, **When** the player
   chooses Hit and draws a 9, **Then** the hand busts, the round ends immediately for that
   hand, and the bet is lost without the dealer drawing further.
3. **Given** a player dealt a natural Blackjack and a dealer upcard that is not an Ace or a
   ten-value card, **When** the hand is dealt, **Then** the hand settles immediately at 3:2.

---

### User Story 2 - Skip the tutorial and go straight to the table (Priority: P1)

An experienced player lands on the game, is offered the tutorial, dismisses it in one
action, and is playing a real hand within seconds. The tutorial never reappears
uninvited, and nothing about the full game is gated behind having completed it.

**Why this priority**: This is the requester's explicit non-blocking requirement and it is
co-critical with core play. A tutorial that cannot be escaped is the single fastest way to
lose Alex, and the constraint shapes the navigation model, so it must be designed in from
the first release rather than retrofitted.

**Independent Test**: Load the game as a first-time visitor, dismiss the tutorial offer,
confirm a hand is playable and that every feature (AI companion, bots, progression) is
available. Reload and confirm the offer does not return.

**Acceptance Scenarios**:

1. **Given** a first-time visitor, **When** the tutorial offer appears, **Then** a dismiss
   control is visible without scrolling and is reachable by keyboard.
2. **Given** a visitor who dismissed the tutorial, **When** they reload the game on the
   same device, **Then** the tutorial is not offered again and is reachable only from the
   help menu.
3. **Given** a visitor who dismissed the tutorial, **When** they inspect the AI companion,
   the bot table, and progression, **Then** all are fully functional and none are locked.

---

### User Story 3 - Learn Blackjack through the guided tutorial (Priority: P2)

A beginner accepts the tutorial and is walked through card values, soft versus hard totals,
what the dealer must do, and the four player actions, using guided hands where the correct
action is highlighted and explained. They exit the tutorial able to play unaided.

**Why this priority**: This is the product's stated teaching purpose and its main draw for
new players, but the game must be playable and skippable before it can be teachable.

**Independent Test**: Run the tutorial start to finish as a new player and confirm each
lesson step gates on the correct player action and explains why it was correct.

**Acceptance Scenarios**:

1. **Given** a player in the tutorial, **When** a lesson step asks for a specific action,
   **Then** the recommended action is visually highlighted and a plain-language reason is
   shown.
2. **Given** a player mid-tutorial, **When** they choose to leave, **Then** they exit
   immediately to the live table with no confirmation prompt and their progress through
   completed steps is retained for a later resume.

---

### User Story 4 - Get real-time strategy advice and understand it (Priority: P2)

While deciding, the player sees each legal action ranked by expected value, the basic
strategy recommendation, and a short plain-language explanation of why the top action wins.
After acting, they learn whether their choice matched the recommendation.

**Why this priority**: The AI companion is the feature that differentiates this from any
other Blackjack demo, and it is what Alex came to evaluate. It requires a working engine
first.

**Independent Test**: Present a fixed set of textbook decision points (16 vs 10, A-7 vs 9,
8-8 vs 10) and verify the ranked EVs and recommendations match a published basic strategy
chart for the configured house rules.

**Acceptance Scenarios**:

1. **Given** a player facing a decision, **When** the hand state is displayed, **Then** each
   legal action is listed with its expected value and the highest-EV action is marked as
   recommended.
2. **Given** a player who takes an action other than the recommendation, **When** the action
   resolves, **Then** the player is shown what was recommended and the EV difference,
   without blocking play or requiring acknowledgement.

---

### User Story 5 - Share the table with AI bots of distinct personalities (Priority: P3)

The player sits at a table with virtual table-mates who play their own hands automatically
in visible, distinct styles — one reckless and high-staking, one strictly mathematical —
so the table feels populated and the contrast between playstyles is instructive.

**Why this priority**: Atmosphere and a teaching contrast rather than core function. The
game is complete and instructive without bots.

**Independent Test**: Seat two bots with different profiles at one table, run twenty seeded
rounds, and confirm each bot's action log is consistent with its stated profile and that no
bot action requires player input.

**Acceptance Scenarios**:

1. **Given** a table with bots seated, **When** a bot's turn begins, **Then** the bot acts
   automatically, its action is labelled with the bot's name and held for 600 ms, and any
   player input collapses the remaining bot turns immediately.
2. **Given** a bot with the Conservative Math profile, **When** it faces a hard 16 against a
   dealer 10, **Then** it takes the basic-strategy action; **and given** the Aggressive
   High-Roller profile in the same spot, **Then** its action may deviate in a way consistent
   with its documented profile.

---

### User Story 6 - Keep progression across sessions (Priority: P3)

The player earns XP for hands played and for decisions matching the recommendation, levels
up, unlocks strategy guides, and returns later on the same device to find their level,
lifetime win/loss record, and EV accuracy score intact.

**Why this priority**: Retention and the post-game analysis payoff. Valuable, but every
preceding story delivers value in a single session without it.

**Independent Test**: Play several hands, note XP and stats, reload the page, and confirm
the values are restored; verify a level-up is announced when the XP threshold is crossed.

**Acceptance Scenarios**:

1. **Given** a player who has completed hands, **When** they reload on the same device,
   **Then** their level, XP, win/loss record, and EV accuracy score are restored.
2. **Given** a player one hand short of a level threshold, **When** they cross it, **Then** a
   level-up is announced and any guide unlocked at that level becomes available immediately.

---

### User Story 7 - Review the architecture as an SDD artifact (Priority: P3)

A technical reviewer clones the repository, runs the engine's test suite, replays a
recorded hand from its seed, and traces a numbered requirement in this spec to the test
that proves it.

**Why this priority**: Serves the project's stated purpose as an SDD showcase. It shapes
testability requirements but ships no player-facing behaviour.

**Independent Test**: From a clean clone, run the test suite and reproduce a specific
recorded hand outcome from its seed alone.

**Acceptance Scenarios**:

1. **Given** a recorded hand's seed and action sequence, **When** the engine replays it,
   **Then** the resulting card sequence and settlement are identical every run.
2. **Given** the test suite, **When** a reviewer reads a test name, **Then** it names the
   requirement identifier it covers.

---

### Edge Cases

**Gameplay**

- Player splits, then is dealt a pair again on a split hand — resplitting is permitted up to
  the configured maximum of four total hands, after which Split is not offered.
- Player splits Aces — each Ace receives exactly one card and the hand stands automatically;
  a ten on a split Ace counts as 21, not a natural Blackjack.
- Player attempts Double Down with a bankroll below the current bet — the action is not
  offered rather than being offered and rejected.
- Dealer shows an Ace and the player holds a natural — resolution follows the configured
  peek rule; the outcome must be identical whether the player is offered even money or not.
- Shoe is exhausted mid-hand — the shoe reshuffles at the configured penetration point
  between hands only, never mid-hand.
- Player bankroll reaches zero — the player is offered a bankroll reset, and the reset is
  recorded so lifetime statistics remain honest.
- Player triggers two actions in rapid succession (double click, keyboard repeat) — the
  second is ignored while the first is resolving.
- Player presses a key during bot turns intending to act on their own hand — the input
  collapses the pending bot turns and is consumed by that skip, never applied as a game
  action to the player's hand.

**Tutorial**

- Player dismisses the tutorial and later opens it from the help menu — it starts from their
  last completed step, not from the beginning.
- Player skips the tutorial before ever seeing a card — full progression, bots, and AI
  companion are available immediately with no locked state.

**Persistence and network**

- Network drops mid-hand — the hand continues to completion locally with no interruption or
  error surfaced during play; results queue for later sync.
- Player closes the tab with unsynced results — queued results persist locally and sync on
  the next visit.
- Two tabs open on the same device — both share one player identity; the later write wins
  for counters, and hand logs from both are retained.
- Local storage is cleared or the player switches device or browser — this is treated as a
  new player with fresh progression (see Assumptions).
- Persistence service returns an error or times out — play is unaffected; the failure is
  surfaced only as an unobtrusive sync indicator.

---

## Requirements *(mandatory)*

Requirements use EARS syntax. `[Ubiquitous]` always applies; `[Event-Driven]` is triggered
by an event; `[State-Driven]` holds while a state persists; `[Optional Features]` applies
only where the named capability is present.

### Functional Requirements — Game Engine

- **FR-001**: `[Ubiquitous]` The game engine SHALL compute hand values with Aces counted as
  11 unless doing so exceeds 21, in which case they count as 1.
- **FR-002**: `[Ubiquitous]` The game engine SHALL expose the set of legal actions for the
  current hand state, and the interface SHALL offer only those actions.
- **FR-003**: `[Ubiquitous]` The game engine SHALL be a pure state-transition function: given
  a state and an action it SHALL return the next state without performing input/output,
  reading the system clock, or consuming unseeded randomness.
- **FR-004**: `[Ubiquitous]` The game engine SHALL accept an externally supplied random seed
  and SHALL produce an identical card sequence for identical seeds.
- **FR-005**: `[Event-Driven]` When a round begins, the game engine SHALL deal two cards to
  each seated participant and two to the dealer, with one dealer card face down.
- **FR-006**: `[Event-Driven]` When the player chooses Hit, the game engine SHALL deal one
  card to the active hand and SHALL end that hand if its total exceeds 21.
- **FR-007**: `[Event-Driven]` When the player chooses Stand, the game engine SHALL end the
  active hand and advance to the next hand or to dealer play.
- **FR-008**: `[Event-Driven]` When the player chooses Double Down, the game engine SHALL
  double the hand's bet, deal exactly one card, and end the hand.
- **FR-009**: `[Event-Driven]` When the player chooses Split on a pair, the game engine SHALL
  create two hands each carrying the original bet and SHALL deal one card to each.
- **FR-010**: `[State-Driven]` While the player holds the configured maximum of four hands,
  the game engine SHALL NOT offer Split.
- **FR-011**: `[State-Driven]` While a split-Ace hand is active, the game engine SHALL deal
  exactly one card and then stand the hand automatically.
- **FR-012**: `[Event-Driven]` When all player hands are resolved, the dealer SHALL reveal
  the hole card and draw until reaching a hard 17 or higher, hitting on soft 17.
- **FR-013**: `[Event-Driven]` When the dealer's hand is final, the game engine SHALL settle
  each player hand: 3:2 for a natural, 1:1 for a win, push on a tie, loss otherwise.
- **FR-014**: `[Event-Driven]` When a round settles, the game engine SHALL emit a hand record
  containing the seed, every action taken, the final totals, and the net bankroll change.
- **FR-015**: `[State-Driven]` While an action is resolving, the game engine SHALL reject
  further actions on that hand.
- **FR-016**: `[Event-Driven]` When shoe penetration passes the configured threshold at the
  end of a round, the game engine SHALL reshuffle before the next round and never mid-round.

### Functional Requirements — AI Strategy Companion

- **FR-020**: `[Ubiquitous]` The AI companion SHALL compute an expected value for every legal
  action at every player decision point, using the table's configured house rules.
- **FR-021**: `[Ubiquitous]` The AI companion SHALL identify the highest-EV action as the
  recommendation and SHALL agree with a published basic strategy chart for the configured
  rules in every decision point of that chart.
- **FR-022**: `[Event-Driven]` When a decision point is reached, the interface SHALL make each
  legal action's expected value reachable from a single disclosure control that names what it
  reveals, and SHALL mark the recommendation within it. The control SHALL sit below the action
  controls, so that the player meets the decision before the answer to it.
- **FR-022a**: `[State-Driven]` While a round is in progress the disclosure SHALL hold whatever
  state the player last set it to, opening and closing on demand. When a new round begins it
  SHALL return to collapsed, so every hand starts from the player's own judgement. The
  post-decision feedback of FR-025 is outside the disclosure and SHALL remain visible while it
  is collapsed.
- **FR-023**: `[Ubiquitous]` The AI companion SHALL accompany each recommendation with a
  plain-language explanation naming the player total, the dealer upcard, and the reason the
  recommended action wins. Explanations SHALL be drawn from a precomputed library keyed on
  hand shape, dealer upcard, and recommended action, resolved locally with no network call.
- **FR-028**: `[Ubiquitous]` The explanation library SHALL cover every decision point in the
  basic strategy chart for the configured house rules, such that no charted decision point
  resolves to a missing explanation.
- **FR-029**: `[Ubiquitous]` Explanation text SHALL be deterministic: the same hand shape,
  dealer upcard, and recommended action SHALL always resolve to the same explanation.
- **FR-024**: `[Event-Driven]` When the player takes an action, the system SHALL record
  whether it matched the recommendation and SHALL update the player's EV accuracy score.
- **FR-024a**: `[Ubiquitous]` The EV accuracy score SHALL be the player's lifetime match
  rate: decisions matching the recommended action divided by total decisions taken,
  expressed as a percentage. It SHALL count every decision point where the player acted,
  including decisions made while the companion display was disabled (FR-026), and SHALL
  exclude automatic actions the player did not choose, such as the forced stand on a split
  Ace (FR-011).
- **FR-024b**: `[State-Driven]` While a player has taken no decisions, the system SHALL
  display the EV accuracy score as unavailable rather than as zero percent.
- **FR-025**: `[Event-Driven]` When the player takes a non-recommended action, the interface
  SHALL show the recommendation and the EV difference without blocking play or requiring
  acknowledgement.
- **FR-026**: `[Optional Features]` Where the companion is disabled by the player, the system
  SHALL still record recommendation-match data for post-game analysis but SHALL NOT display
  advice during play.
- **FR-027**: `[Event-Driven]` When a decision point resolves to no matching library entry,
  the system SHALL display the recommendation and its expected value alone rather than
  delaying the decision point or showing placeholder text.

### Functional Requirements — AI Bots

- **FR-030**: `[Optional Features]` Where bots are seated at the table, each bot SHALL play
  its own hands to completion with no player input.
- **FR-031**: `[Ubiquitous]` Each bot SHALL have a named, documented playstyle profile that
  determines its decisions, and its decisions SHALL be reproducible from the round seed.
- **FR-032**: `[Ubiquitous]` The system SHALL provide at least two contrasting bot profiles:
  one that follows basic strategy strictly, and one that takes documented higher-variance
  deviations with larger stakes.
- **FR-033**: `[Event-Driven]` When a bot acts, the interface SHALL show the bot's name and
  action for 600 ms before advancing to the next action or participant.
- **FR-036**: `[Event-Driven]` When the player provides any input while bot turns are
  pending, the system SHALL resolve all remaining bot actions immediately and advance to the
  next player decision point, with every skipped action still shown in the round's action
  log.
- **FR-037**: `[Ubiquitous]` The bot turn window SHALL be presentation pacing only. It SHALL
  NOT delay engine resolution, and skipping it SHALL NOT change any outcome.
- **FR-034**: `[State-Driven]` While a bot is taking its turn, the interface SHALL keep the
  player's own controls disabled and SHALL indicate whose turn it is.
- **FR-035**: `[Ubiquitous]` Bot outcomes SHALL NOT affect the player's bankroll,
  progression, or statistics.

### Functional Requirements — Tutorial

- **FR-040**: `[Event-Driven]` When a player opens the game for the first time on a device,
  the system SHALL offer the tutorial.
- **FR-041**: `[Ubiquitous]` The system SHALL present a dismiss control on every tutorial
  surface, visible without scrolling and reachable by keyboard.
- **FR-042**: `[Event-Driven]` When the player dismisses the tutorial, the system SHALL exit
  to the live table immediately, without a confirmation prompt and without an intermediate
  screen.
- **FR-043**: `[State-Driven]` While a player has dismissed or completed the tutorial, the
  system SHALL NOT offer it again automatically on that device.
- **FR-044**: `[Ubiquitous]` The system SHALL make the tutorial available on demand from the
  help menu at any time.
- **FR-045**: `[Ubiquitous]` No game capability — table play, AI companion, bots, or
  progression — SHALL be gated behind tutorial completion.
- **FR-046**: `[Event-Driven]` When the player re-enters the tutorial after leaving it, the
  system SHALL resume from their last completed step.
- **FR-047**: `[State-Driven]` While a tutorial lesson step is active, the interface SHALL
  highlight the action the step teaches and SHALL state why it is correct.

### Functional Requirements — Progression

- **FR-050**: `[Event-Driven]` When a hand settles, the system SHALL award 10 XP for the hand
  played plus 2 XP for each decision in that hand that matched the recommendation. XP SHALL
  be awarded regardless of whether the hand was won or lost.
- **FR-051**: `[Event-Driven]` When accumulated XP crosses a level threshold, the system
  SHALL raise the player's level, announce it, and immediately grant any unlock tied to that
  level. Crossing more than one threshold from a single award SHALL raise the level once per
  threshold crossed and SHALL grant every unlock passed.
- **FR-051d**: `[Ubiquitous]` The system SHALL use this fixed ladder of 10 levels, with
  thresholds expressed as cumulative lifetime XP:

  | Level | Cumulative XP | Unlock |
  |-------|---------------|--------|
  | 1 | 0 | — |
  | 2 | 50 | Post-game analysis view |
  | 3 | 120 | — |
  | 4 | 220 | Basic strategy chart |
  | 5 | 350 | — |
  | 6 | 520 | Soft-hands chart |
  | 7 | 730 | — |
  | 8 | 990 | Splitting chart |
  | 9 | 1300 | — |
  | 10 | 1700 | — |

- **FR-051e**: `[State-Driven]` While a player is at level 10, the system SHALL continue to
  accumulate and display lifetime XP but SHALL NOT raise the level further, and SHALL
  present level 10 as a completed ladder rather than as a pending next level.
- **FR-051a**: `[Ubiquitous]` Every unlockable guide SHALL be a view over data the system
  already computes — a strategy chart for the configured house rules, a soft-hands chart, a
  splitting chart, and the post-game analysis view. No guide SHALL require prose authored
  beyond the explanation library of FR-028.
- **FR-051b**: `[State-Driven]` While a guide is locked, the interface SHALL show its
  existence and the level that unlocks it, and SHALL NOT show its contents.
- **FR-051c**: `[Ubiquitous]` Guide contents SHALL be derived from the same strategy source
  the companion uses, so an unlocked chart and a live recommendation can never disagree.
- **FR-052**: `[Ubiquitous]` The system SHALL maintain per-player lifetime totals for hands
  played, wins, losses, pushes, net bankroll change, decisions taken, decisions matching the
  recommendation, and the EV accuracy score derived from the latter two per FR-024a.
- **FR-053**: `[Ubiquitous]` The system SHALL identify a player by a client-generated
  identifier stored on the device, created on first visit with no sign-up step.
- **FR-054**: `[Ubiquitous]` The system SHALL NOT collect or store personal information;
  stored records SHALL contain only the generated identifier, gameplay statistics, and hand
  logs.
- **FR-055**: `[Event-Driven]` When a bankroll reset is taken, the system SHALL record the
  reset and SHALL continue lifetime statistics rather than clearing them.

### Functional Requirements — Persistence

- **FR-060**: `[Ubiquitous]` The system SHALL treat local state as authoritative during play
  and SHALL treat stored state as a background replica.
- **FR-061**: `[Event-Driven]` When a hand settles, the system SHALL enqueue the hand record
  and updated progression for background persistence without blocking the interface.
- **FR-062**: `[Event-Driven]` When persistence fails or times out, the system SHALL retain
  the queued records locally, SHALL retry, and SHALL NOT interrupt play or surface a modal
  error.
- **FR-063**: `[State-Driven]` While unsynced records exist, the interface SHALL show an
  unobtrusive sync-pending indicator.
- **FR-064**: `[Event-Driven]` When the player returns to the game, the system SHALL restore
  progression and statistics for their stored identifier, and SHALL flush any queued records
  before restoring.
- **FR-065**: `[Ubiquitous]` Stored records SHALL be filtered by the player's generated
  identifier using flat table schemas, with no row-level security policies and no
  multi-tenant permission model.
- **FR-066**: `[Event-Driven]` When no stored identifier is found on the device, the system
  SHALL create a new player with default progression and SHALL allow play to begin before
  any persistence call completes.
- **FR-067**: `[Ubiquitous]` The system SHALL retain per-hand logs sufficient to reconstruct
  a session for post-game analysis: seed, actions, recommendations, and outcome.
- **FR-068**: `[Ubiquitous]` All reads from and writes to the database SHALL pass through the
  application's own server-side endpoints. The client SHALL NOT hold a database credential
  and SHALL NOT contact the database directly.
- **FR-069**: `[Ubiquitous]` Server-side endpoints SHALL accept the player identifier as the
  scope of every read and write, and SHALL reject any request that omits it. Requests SHALL
  NOT be able to address rows belonging to a different identifier by any parameter other
  than that identifier.
- **FR-070**: `[Event-Driven]` When a server-side endpoint receives a malformed request or a
  request whose payload fails validation, it SHALL reject the request without partial writes
  and SHALL return a response the client can retry safely.
- **FR-071**: `[Ubiquitous]` Persistence endpoints SHALL be idempotent with respect to a
  given hand record, such that a retried write after an ambiguous failure does not duplicate
  a hand log or double-count a progression counter.

### Non-Functional Requirements

- **NFR-001**: `[Ubiquitous]` A player action on a card SHALL produce a visible interface
  response within 100 ms at the 95th percentile, measured on a mid-range laptop. Deliberate
  presentation pacing — dealing animation and the bot turn window of FR-033 — is excluded
  from this measurement, but SHALL always be interruptible by player input.
- **NFR-002**: `[Ubiquitous]` Expected-value computation for all legal actions at a decision
  point, together with resolution of the matching explanation, SHALL complete within 100 ms
  at the 95th percentile and SHALL NOT delay rendering of the hand.
- **NFR-003**: `[Ubiquitous]` A background persistence write SHALL complete within 300 ms at
  the 95th percentile measured from an edge region, covering the full round trip through the
  server-side endpoint to the database and back. Its latency SHALL NOT be on any interactive
  path.
- **NFR-004**: `[Ubiquitous]` The application SHALL reach an interactive table within 2
  seconds of first load on a standard broadband connection.
- **NFR-005**: `[Ubiquitous]` Serverless functions SHALL be stateless and SHALL respect
  platform execution limits; no request handler SHALL depend on in-memory state surviving
  between invocations.
- **NFR-006**: `[Ubiquitous]` The database credential SHALL exist only in server-side
  configuration and SHALL NOT be present in any client bundle, client-visible environment
  variable, or network response. A build that ships the credential to the browser SHALL be
  treated as a defect, not a configuration choice.
- **NFR-007**: `[Ubiquitous]` The game SHALL remain fully playable — deal, act, settle,
  advise, and explain — with no network connection after initial load. No interactive path
  SHALL depend on a remote text-generation service.
- **NFR-008**: `[Ubiquitous]` All player actions SHALL be operable by keyboard alone, and
  interactive elements SHALL meet WCAG 2.1 AA contrast.
- **NFR-009**: `[Ubiquitous]` The game engine SHALL carry unit test coverage of at least 90%
  of rules and settlement logic, per constitution Principle II.
- **NFR-010**: `[Ubiquitous]` The interface SHALL be usable at viewport widths from 360 px to
  1920 px without horizontal scrolling.

### Key Entities

- **Player**: A person identified by a device-generated identifier. Holds level, XP,
  bankroll, lifetime statistics, unlocked guides, and tutorial state. The EV accuracy score
  is derived, not stored independently: the two counters `decisions taken` and `decisions
  matched` are the source of truth, which keeps the score monotonically reconcilable across
  devices and queued syncs (see the reconciliation rules in System State & Database
  Boundary).
- **Round**: One deal to settlement. Holds the seed, the shoe state at deal, the
  participating hands, and the dealer hand.
- **Hand**: A set of cards belonging to one participant within a round, with its own bet,
  action history, final total, and outcome. A split produces sibling hands.
- **Bot**: A named virtual participant with a playstyle profile governing its decisions.
- **Recommendation**: The companion's output at one decision point — ranked actions with
  expected values, the recommended action, and its explanation.
- **HandLog**: The persisted record of a settled round for post-game analysis: seed, actions,
  recommendations, decisions matched, and net result.
- **ProgressionEvent**: A recorded XP award, level change, or unlock, tied to a player.
- **Guide**: An unlockable view over computed data — a strategy chart or the post-game
  analysis view — identified by name and gated on a level. Holds no authored content of its
  own; it renders from the same strategy source the companion uses.

---

## System State & Database Boundary *(mandatory)*

The boundary exists to guarantee NFR-001: no interactive action may wait on the network.

**Local and authoritative during play** — held in the client store, never awaited from the
server:

- Current round: shoe, dealt cards, all hands, whose turn it is, legal actions
- Current bet and working bankroll
- Recommendations and expected values for the active decision point
- Bot decisions for the current round
- Tutorial position and dismissal state
- XP and level as displayed, applied optimistically the moment a hand settles
- The outbound queue of settled hands and progression deltas awaiting sync

**Persisted in the background** — written after settlement through the application's own
server-side endpoints (FR-068), never on the interactive path:

- Player record: identifier, level, XP, lifetime statistics, EV accuracy score, unlocks
- Hand logs for post-game analysis
- Progression events

**Rules governing the boundary**:

1. No player-facing interaction blocks on a persistence call. Reads happen at session start;
   writes happen after a hand settles.
2. Writes are fire-and-forget with local retry. A failed write is invisible to gameplay and
   visible only as a sync-pending indicator. Because retries follow ambiguous failures, the
   endpoints are idempotent per hand record (FR-071), so a retry can never double-count.
3. On session start the client loads the stored player record once. If the load fails or is
   slow, play begins from local state and reconciles when the load arrives.
4. Reconciliation on conflict: monotonic counters (XP, hands played, decisions taken,
   decisions matched, lifetime totals) take the higher value; hand logs are append-only and
   never overwritten; the current bankroll takes the local value, since local play is
   authoritative. The EV accuracy score is never reconciled directly — it is recomputed from
   the two reconciled decision counters.
5. Nothing in the current round is persisted mid-hand. A hand interrupted by a crash or tab
   close is lost rather than partially recorded.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The card table responds to every player action instantly — no action shows a
  perceptible delay, at the 95th percentile, on a mid-range laptop.
- **SC-002**: An experienced player can go from first load to playing a live hand in under
  10 seconds and at most two interactions, without completing any tutorial content.
- **SC-003**: The companion's recommendation matches a published basic strategy chart in
  100% of that chart's decision points for the configured house rules.
- **SC-004**: A beginner who completes the tutorial can then correctly identify the
  recommended action in at least 8 of 10 fresh decision points without assistance.
- **SC-005**: 95% of settled hands are persisted and visible in post-game analysis within 5
  seconds of the hand ending, under normal connectivity.
- **SC-006**: A player who loses connectivity mid-hand completes that hand with no visible
  error and no lost progression once connectivity returns.
- **SC-007**: A returning player on the same device sees their level, statistics, and
  unlocks restored on 100% of visits where local identity is intact.
- **SC-008**: A reviewer can reproduce any recorded hand's exact outcome from its seed and
  action list, with a 100% match rate across repeated runs.
- **SC-009**: The tutorial can be dismissed from every one of its surfaces in a single
  interaction.
- **SC-010**: Every decision point in the reference strategy chart resolves to an
  explanation — 100% coverage, no gaps — and the full game including advice works with the
  network disabled.
- **SC-011**: A player following the recommendation reaches the top of the progression
  ladder within roughly 120–140 hands — a few sittings, not a grind — and every guide has
  been unlocked by that point.

---

## Out of Scope (Phase 1)

The following are explicitly excluded from this release:

- **Real money, wagering, or purchases of any kind.** Play money only.
- **User accounts, passwords, email, or social sign-in.** Device-scoped identity only.
- **Cross-device or cross-browser progression sync**, and any progression recovery code.
- **Multiplayer between real humans**, matchmaking, chat, or shared tables.
- **Leaderboards, friends, or any social comparison feature.**
- **Card counting instruction, count tracking, or deviation ("index play") charts.**
- **Runtime language-model text generation.** Explanations are authored content resolved
  locally (FR-023). No interactive path calls a text-generation service in Phase 1.
- **Authored lesson articles or written deep-dives as unlockable content.** Guides are views
  over computed data only (FR-051a).
- **Cosmetic unlocks** — table themes, card backs, avatars — and any progression reward that
  is not a view over data the system already produces.
- **Insurance, Surrender, and side bets** (21+3, Perfect Pairs). The engine may model them
  behind a flag but they are not offered to players in Phase 1.
- **Configurable house rules in the interface.** One fixed rule set ships; the engine
  accepts rule configuration, but no player-facing rules editor exists.
- **Row Level Security policies, multi-tenant permissioning, or admin roles.** Excluded by
  explicit direction.
- **Native mobile applications.** Responsive web only.
- **Localisation.** English only.
- **Server-authoritative play or anti-cheat.** The client is trusted; this is a single-player
  play-money trainer.

---

## Assumptions

Recorded defaults chosen where the description did not specify:

1. **House rules**: six-deck shoe, dealer hits soft 17, Blackjack pays 3:2, double on any
   two cards, double after split allowed, split to a maximum of four hands, split Aces
   receive one card each, no surrender. These are stated so the companion's EV figures are
   verifiable against a specific chart.
2. **Identity is device-scoped.** Clearing browser storage or switching device produces a new
   player with fresh progression. This is accepted rather than solved, because recovery codes
   or accounts would exceed the lean-persistence rule.
3. **Bankroll** starts at a fixed play-money amount and can be reset on demand when
   exhausted; resets are logged so lifetime statistics stay honest.
4. **Bots do not compete for cards in a way that changes player outcomes materially**, and
   bot results never touch player statistics.
5. **Two bot profiles ship in Phase 1** — "Conservative Math AI" and "Aggressive
   High-Roller" — as the minimum needed to demonstrate contrast.
6. **The tutorial is a fixed linear sequence** of guided hands, not adaptive to player
   performance.
7. **EV is computed against the configured rule set with a fresh-shoe composition**, not a
   running count, since counting is out of scope.
8. **Explanation text is authored content, not runtime generation.** Explanations are
   written once against the charted decision points and shipped with the client. The
   phrasing set is finite and will repeat across sessions; this is accepted in exchange for
   instant, offline, deterministic explanations. The product's AI claim rests on the
   expected-value engine and the bot agents, not on runtime text generation.
9. **Analytics of player behaviour beyond gameplay statistics are not collected.**
10. **Constitution alignment — resolved.** The project constitution governed a Python CLI
   application when this specification was drafted, which contradicted the stack above. It
   was amended to v2.0.0 on 2026-07-26 to govern this web application: the technology
   baseline was replaced, Principle III's terminal input mechanics were restated as UI
   rules, and Principle IV now budgets first-load-to-interactive rather than CLI cold
   start. The requirements in this specification are written against v2.0.0 and no longer
   deviate from it.

---

## Dependencies

- A hosting platform providing static delivery and serverless functions (Vercel).
- A managed PostgreSQL service reachable **only from those functions** (Supabase). The
  database is not addressed by the browser.
- Server-side configuration capable of holding a privileged database credential that is
  excluded from client bundles (NFR-006).
- A published basic strategy chart matching the Assumption 1 rule set, used as the test
  oracle for FR-021 and SC-003.
- An authored explanation library covering every charted decision point (FR-023, FR-028).
  This is content produced as part of this feature and shipped with the client; it introduces
  no runtime service dependency.

---

## Acceptance Criteria (Gherkin) *(mandatory)*

### Feature: Core gameplay

```gherkin
Scenario: Player stands and the dealer draws to seventeen
  Given a seeded shoe where the player is dealt 10 and 8
    And the dealer's upcard is 6 and the hole card is 9
    And the player has bet 10 chips
  When the player chooses Stand
  Then the dealer reveals the hole card showing 15
    And the dealer draws until reaching a hard 17 or higher
    And if the dealer busts the player is paid 10 chips
    And the bankroll reflects the settled result

Scenario: Player busts on a hit
  Given the player holds 10 and 6 for a hard 16
    And the dealer's upcard is 10
  When the player chooses Hit and draws a 9
  Then the hand total is 25
    And the hand ends immediately as a bust
    And the bet is lost without the dealer drawing further

Scenario: Doubling down deals exactly one card
  Given the player holds 5 and 6 for 11
    And the player's bankroll is at least twice the current bet
  When the player chooses Double Down
  Then the hand's bet is doubled
    And exactly one card is dealt to the hand
    And the hand ends with no further actions offered

Scenario: Splitting a pair creates two independent hands
  Given the player is dealt two 8s
    And the player's bankroll covers a second bet
  When the player chooses Split
  Then two hands exist, each holding one 8 and each carrying the original bet
    And each hand receives one additional card
    And the player acts on the first hand before the second

Scenario: Split Aces receive one card and stand
  Given the player is dealt two Aces
  When the player chooses Split
  Then each hand receives exactly one card
    And both hands stand automatically
    And a ten dealt to a split Ace counts as 21, not a natural Blackjack

Scenario: Split limit is enforced
  Given the player already holds four hands from previous splits
  When the player is dealt another pair
  Then Split is not offered as a legal action

Scenario: Dealer hits soft seventeen
  Given all player hands are resolved
    And the dealer holds an Ace and a 6 for a soft 17
  When the dealer plays
  Then the dealer draws at least one more card
```

### Feature: Skipping versus completing the tutorial

```gherkin
Scenario: Experienced player dismisses the tutorial instantly
  Given a first-time visitor on a device with no stored player
  When the tutorial offer appears
  Then a dismiss control is visible without scrolling
    And it is reachable by keyboard
  When the visitor dismisses the tutorial
  Then the live table is shown immediately
    And no confirmation prompt is displayed
    And a hand can be played straight away

Scenario: Dismissed tutorial does not return
  Given a player who dismissed the tutorial
  When the player reloads the game on the same device
  Then the tutorial is not offered
    And the tutorial remains available from the help menu

Scenario: No feature is gated behind the tutorial
  Given a player who has never opened the tutorial
  When the player inspects the AI companion, the bot table, and progression
  Then all three are fully functional
    And none displays a locked or "complete the tutorial" state

Scenario: Beginner completes the tutorial
  Given a first-time visitor who accepts the tutorial
  When the visitor works through every lesson step
  Then each step highlights the action it teaches
    And each step explains why that action is correct
  When the final step completes
  Then the tutorial is marked complete
    And the player is returned to the live table

Scenario: Leaving mid-tutorial preserves progress
  Given a player who has completed three of eight tutorial steps
  When the player leaves the tutorial
  Then the live table is shown immediately
  When the player later reopens the tutorial from the help menu
  Then it resumes at step four
```

### Feature: Strategy advice and levelling up

```gherkin
Scenario: Recommendations are shown at a decision point
  Given the player holds a hard 16 against a dealer 10 upcard
  When the decision point is reached
  Then each legal action is displayed with its expected value
    And Hit is marked as the recommended action
    And a plain-language explanation of the recommendation is shown

Scenario: Explanations resolve locally and offline
  Given the network connection is disabled
    And the player reaches a decision point that appears in the strategy chart
  When the recommendation is displayed
  Then a plain-language explanation is shown alongside it
    And the explanation names the player total and the dealer upcard
    And no network request is made to produce it
  When the same hand shape and dealer upcard are reached again
  Then the same explanation text is shown

Scenario: A decision point with no library entry degrades cleanly
  Given a decision point that has no matching explanation entry
  When the recommendation is displayed
  Then the recommended action and its expected value are shown
    And no placeholder or empty explanation area is displayed
    And the decision point is not delayed

Scenario: A non-recommended action is recorded without blocking play
  Given the player holds a hard 16 against a dealer 10
    And the recommendation is Hit
  When the player chooses Stand
  Then the action is carried out without interruption
    And the player is shown the recommendation and the EV difference
    And the decision is recorded as not matching the recommendation
    And the decisions-taken counter increases by one
    And the decisions-matched counter is unchanged
    And the EV accuracy score is recomputed as matched divided by taken

Scenario: Levelling up grants an unlock immediately
  Given a player at level 3 with 210 lifetime XP
    And level 4 requires 220 XP and unlocks the basic strategy chart
  When the player settles a hand with 2 decisions matching the recommendation
  Then 14 XP is awarded, bringing the total to 224
    And the level increases to 4
    And a level-up is announced
    And the basic strategy chart is available without a reload

Scenario: A locked guide is visible but not readable
  Given a player at level 3
  When the player opens the guides list
  Then the soft-hands chart is listed as locked
    And the level required to unlock it is shown
    And its contents are not displayed

Scenario: The ladder ends at level 10
  Given a player at level 10 with 1750 lifetime XP
  When the player settles further hands
  Then lifetime XP continues to increase
    And the level remains 10
    And no next-level threshold is displayed

Scenario: Bots play their own turns unattended
  Given a table seated with the Conservative Math AI and the Aggressive High-Roller
  When a round is dealt
  Then each bot acts automatically on its turn
    And each bot's action is labelled with its name and shown for 600 ms
    And the player's controls are disabled while a bot acts
    And no bot outcome changes the player's bankroll or statistics

Scenario: An impatient player collapses the bot turns
  Given two bots have pending turns
  When the player provides any input
  Then all remaining bot actions resolve immediately
    And every skipped action still appears in the round's action log
    And the outcome is identical to letting the turns play out
    And the input is consumed by the skip rather than acting on the player's hand
```

### Feature: Persistence boundary

```gherkin
Scenario: A settled hand is persisted in the background
  Given a player with an active session
  When a hand settles
  Then the interface updates the bankroll and XP immediately
    And the hand record and progression update are enqueued for persistence
    And the interface does not wait for the write to complete
  When the write succeeds
  Then the hand appears in post-game analysis
    And no sync-pending indicator is shown

Scenario: Network loss mid-hand does not interrupt play
  Given a player partway through a hand
  When the network connection is lost
  Then the hand plays to completion normally
    And no error is surfaced during play
    And the settled result is queued locally
    And a sync-pending indicator appears
  When connectivity returns
  Then the queued results are written
    And the indicator clears

Scenario: Returning player restores progression
  Given a player who previously reached level 4 with 120 hands played
  When the player returns to the game on the same device
  Then the stored player record is loaded for their identifier
    And level, XP, lifetime statistics, and unlocks are restored
    And any queued records from the previous session are flushed first

Scenario: A new device starts a fresh player
  Given a visitor on a device with no stored identifier
  When the game loads
  Then a new identifier is generated
    And default progression is applied
    And play begins before any persistence call completes

Scenario: A retried write does not double-count
  Given a settled hand whose write failed ambiguously after reaching the server
    And the record is still queued locally
  When the client retries the write for that same hand record
  Then exactly one hand log exists for that hand
    And the progression counters reflect the hand exactly once

Scenario: The database is never addressed by the browser
  Given the deployed application
  When the client bundle and all network traffic from the browser are inspected
  Then no database credential appears in the bundle or in any response
    And every persistence request targets the application's own endpoints
    And each request carries the player identifier as its scope

Scenario: Persistence failure never blocks the table
  Given the persistence service is returning errors
  When a hand settles
  Then the bankroll and XP still update immediately
    And no modal error is displayed
    And the record is retried in the background
```

---

## Resolved Decisions

- **D1 — How are the explanations in FR-023 produced?** *(resolved 2026-07-26)*
  **Decision: a precomputed, locally resolved explanation library.** Live language-model
  calls were considered and rejected: a per-decision request adds cost and network latency to
  a path budgeted at 100 ms by NFR-002, and it would break the offline guarantee in NFR-007.
  The accepted cost is a finite phrasing set that repeats across sessions. Recorded in
  FR-023, FR-027, FR-028, FR-029, NFR-002, NFR-007, SC-010, and Assumption 8. Runtime text
  generation is explicitly out of scope for Phase 1.
