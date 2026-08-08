# Blackjack AI Trainer

[![CI](https://github.com/diegoscpereira/p03-claude-code-blackjack-game/actions/workflows/ci.yml/badge.svg)](https://github.com/diegoscpereira/p03-claude-code-blackjack-game/actions/workflows/ci.yml)
[![Coverage](https://github.com/diegoscpereira/p03-claude-code-blackjack-game/actions/workflows/coverage.yml/badge.svg)](https://github.com/diegoscpereira/p03-claude-code-blackjack-game/actions/workflows/coverage.yml)

A browser Blackjack trainer that shows the **expected value of every legal action**, explains
why one is best, and seats two contrasting bots at the table.

**Live:** [p03-claude-code-blackjack-game.vercel.app](https://p03-claude-code-blackjack-game.vercel.app)

![The table mid-hand: progression, dealer and player hands, two bots, and the expected-value companion](docs/screenshots/table.png)

---

## What this project is really about

This is a **portfolio piece about working with AI, particularly Claude Code**. The whole application was built by driving Claude Code through a spec-driven
workflow: I set the direction, made the product and architecture calls, reviewed the output,
and deployed it. Claude wrote the code, the tests and the documents.

What I wanted to validate was that an **AI coding agent can be held to an engineering standard** — whether you can give it a written constitution, make it
plan before it builds, and enforce the result with gates it cannot talk its way past. Furthermore, one of the goals was to **work with advanced Claude Code concepts and tools, such as Hooks, Permissions and Skills**.

Namely: custom skills as slash commands
(`/speckit-*`), a written constitution as durable project rules, a scoped permission allowlist,
and three hooks — see [`.claude/`](.claude/) and [Hooks](#hooks), below.

| | |
|---|---|
| **Tasks planned and completed** | 133 of 133, tracked in [`tasks.md`](specs/001-blackjack-ai-trainer/tasks.md) |
| **Tests** | 1,076 unit + integration, 56 end-to-end |
| **Coverage on the rules engine** | 98.8% (`src/engine`), 99.3% (`src/strategy`) |
| **CI gates** | 6, all blocking |
| **Architecture decision records** | 4, each naming the rejected alternative |
| **Requirements** | 80 functional, 11 non-functional, all traceable to a test |

---

## How it was built

**Spec-driven development (SDD)**: the specification, plan, and task list are written and
reviewed as artefacts *before* any code is generated, each step gated on the one before it. The
`/speckit-*` commands come from GitHub's [Spec Kit](https://github.com/github/spec-kit).

```
/speckit-constitution   →  the rules the project cannot break
/speckit-specify        →  what it must do, in requirements
/speckit-clarify        →  five ambiguities resolved before planning
/speckit-plan           →  architecture, stack, and the constitution check
/speckit-tasks          →  133 tasks, tests ordered before implementations
/speckit-analyze        →  cross-checked the documents against each other
/speckit-implement      →  built it, phase by phase
```

The artefacts are all in [`specs/001-blackjack-ai-trainer/`](specs/001-blackjack-ai-trainer/):

| Document | What it settles |
|---|---|
| [constitution.md](.specify/memory/constitution.md) | Four principles: code quality, test-first, UX consistency, performance |
| [spec.md](specs/001-blackjack-ai-trainer/spec.md) | Requirements and the five recorded clarifications |
| [research.md](specs/001-blackjack-ai-trainer/research.md) | Eight technical decisions with rejected alternatives |
| [plan.md](specs/001-blackjack-ai-trainer/plan.md) | Architecture |
| [data-model.md](specs/001-blackjack-ai-trainer/data-model.md) | The game model, the two tables, and why one value is deliberately not a column |
| [contracts/](specs/001-blackjack-ai-trainer/contracts/) | The engine API and the HTTP API |

**The constitution is the part that made the difference.** It sets numeric budgets — 100 ms to
respond to a click, 90% coverage on the rules, 30 seconds for the test suite — and every one
became a CI gate.

---

## Hooks

Three hooks in [`.claude/settings.json`](.claude/settings.json):

- **`check-branch-sync.mjs`** — blocks a commit or push when the branch is behind its upstream,
  so a stale checkout can't turn into a rejected push or a needless merge.
- **`check-no-secrets.mjs`** — scans the outgoing commits for a JWT-shaped string or a stray
  `.env` file and refuses the push. The bundle scan guards `dist/`; this guards the repository.
- **`check-sdd-flow.mjs`** — when a brand-new file appears under `src/` or `api/`, injects a
  reminder that the work should trace to a task in `tasks.md` and to a test written first.

---

## Architecture

```mermaid
graph LR
    UI["ui/<br/>React + Tailwind"] --> STORE["store/<br/>Zustand"]
    STORE --> ENGINE["engine/<br/>pure, seeded"]
    STORE --> STRAT["strategy/ bots/ progression/"]
    STORE --> SYNC["sync/<br/>outbox"]
    STRAT --> ENGINE
    SYNC -.->|"background only"| API["api/<br/>Vercel Functions"]
    API --> DB[("Supabase<br/>PostgreSQL")]
```

**The dotted edge is the only network hop, and the only one allowed to fail.** Everything solid
is synchronous and local, so the game is fully playable offline after first load.

Progression is written to Supabase Postgres through the app's own serverless endpoints. The database credential stays server-side, and a build gate scans the client
bundle to prove it. Writes go through a queue that survives a tab close and retries safely.

Imports point one way only, enforced by a lint rule *and* by
[a test](tests/unit/architecture.test.ts) that a `// eslint-disable` cannot silence. Full
walkthrough in [docs/architecture.md](docs/architecture.md).

---

## What it does

- **Companion** — every legal action ranked by expected value, with the recommendation marked
  and explained in a sentence.
- **Two bots** — contrasting playstyles, acting on their own hands, skippable at any time.
- **Tutorial** — eight guided lessons for beginners, dismissable in one click, with nothing
  locked behind it.
- **Progression** — XP, ten levels, unlockable strategy charts, and lifetime statistics that
  survive a reload or a flight with no wifi.

Six decks, dealer hits soft 17, blackjack pays 3:2, double after split, resplit to four hands.
Play money only.

---

## Run it locally

```bash
npm install
npm run generate:ev    # the strategy tables are generated, not committed
npm run dev            # http://localhost:5173
```

No database needed — progression stays local and the sync indicator simply shows as pending,
which is the offline behaviour working as designed. Full setup, deployment, and the validation
checklist are in [quickstart.md](specs/001-blackjack-ai-trainer/quickstart.md).

```bash
npm run test           # 1,076 tests, ~5s
npm run test:e2e       # 56 browser tests
```

---

## Additional notes

**On the "AI" term:** The app was *built* with
AI. The intelligence *inside* it is decision-theoretic — an expected-value solver, strategy
tables, and rule-based bots. Nothing calls a language model at runtime; the explanations are
authored content resolved locally, a decision recorded in
[ADR 0003](docs/adr/0003-template-explanations.md) along with why generating them live would
have been the wrong trade.

**One performance budget is missed.** Background writes were budgeted at 300 ms and measure
594 ms at the 95th percentile against the live deployment. The cause is identified and written
down in [docs/architecture.md](docs/architecture.md) rather than quietly dropped. It does not
affect gameplay, because nothing you click ever waits on the network.

---

## Next steps

**1. An MCP server over the engine.** Expose the engine as tools an agent can call — replay a
hand from its seed, query the solver, pull a player's deviation pattern from the hand logs. It
closes the AI-built-but-not-AI-embedded gap noted above, and the hard parts already exist:
`replayRound`, the EV tables, and the decision records are built and tested.

**2. A post-session coach.** The player-facing half of the same idea: *"you deviated on six of
nine soft hands, all in the same direction."* Same hand logs, same primitives — off the
interactive path, so the offline guarantee holds.
