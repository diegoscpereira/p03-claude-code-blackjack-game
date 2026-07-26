# Quickstart & Validation Guide

**Feature**: Web-Based Blackjack AI Trainer | **Plan**: [plan.md](./plan.md)

How to run the project and prove the feature works. Scenarios map to spec Success Criteria —
each is something you can actually check, not a description of intent.

> **Status**: this guide describes the target state. Until `/speckit-tasks` and
> `/speckit-implement` have run, the commands below have nothing to run against.

---

## Prerequisites

- Node 20+ and npm
- A Supabase project (free tier) — **optional**: the game is fully playable without one.
  Skipping it means progression stays local and the sync indicator shows pending forever,
  which is itself a valid demonstration of FR-062.
- Vercel CLI (`npm i -g vercel`) only if you want to run `api/` routes locally

## Setup

```bash
npm install
cp .env.example .env.local
```

`.env.local`:

```bash
# Server-side only. Never prefixed with VITE_ — that prefix inlines values into the
# client bundle, which would fail the constitution's Data Safety gate.
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_KEY=<service-role-key>
```

Apply the schema:

```bash
psql "$SUPABASE_DB_URL" -f supabase/schema.sql
```

Generate the strategy tables (required — `src/strategy/data/` is generated, not committed):

```bash
npm run generate:ev
```

## Run

```bash
npm run dev          # Vite only — game works, /api returns 404, sync stays queued
vercel dev           # Vite + api/ routes — full persistence
```

Open `http://localhost:5173`.

---

## Validation scenarios

### V1 — Play a hand (SC-001, User Story 1)

1. Place a bet, deal.
2. Take each of Hit, Stand, Double, and Split across several hands.

**Expect**: every card appears immediately on click — no perceptible delay. Only legal actions
are offered; Double disappears when the bankroll cannot cover it rather than erroring.

**Automated**: `npm run test:unit -- engine`

### V2 — Skip the tutorial (SC-002, SC-009, User Story 2)

1. Clear site data, reload.
2. Dismiss the tutorial offer in one interaction.

**Expect**: the live table within 10 seconds and at most two interactions. No confirmation
prompt. The companion, bots, and progression are all fully available. Reload — the offer does
not return.

**Automated**: `npm run test:e2e -- tutorial-skip`

### V3 — Strategy advice matches the chart (SC-003, FR-021)

Reach these decision points and compare against a published chart for six-deck, dealer hits
soft 17:

| Hand | Dealer | Expected |
|---|---|---|
| Hard 16 | 10 | Hit |
| Soft 18 (A-7) | 9 | Hit |
| Pair of 8s | 10 | Split |
| Hard 12 | 4 | Stand |
| Hard 11 | 10 | Double |

**Expect**: each legal action shows an EV, the recommendation is marked, and an explanation
names your total and the dealer upcard.

**Automated**: `npm run test:unit -- strategy` — table-driven across the entire chart, not
these five.

### V4 — Determinism (SC-008, User Story 7)

```bash
npm run test:unit -- determinism
```

**Expect**: identical card sequences and settlements across repeated runs from the same seed.
This is the test that makes the "replayable from seed" claim real.

### V5 — Offline mid-hand (SC-006, NFR-007)

1. Start a hand.
2. Kill the network (DevTools → Network → Offline).
3. Play the hand to completion.

**Expect**: the hand finishes normally. No error, no modal. The sync indicator appears. Restore
the network — the indicator clears and the hand appears in post-game analysis.

**Automated**: `npm run test:e2e -- offline`

### V6 — Retry does not double-count (FR-071)

```bash
npm run test:integration -- outbox
```

**Expect**: after a simulated ambiguous failure and retry, exactly one hand log exists and
progression counters reflect the hand once.

### V7 — Level up (FR-051, FR-051d)

Play until crossing a threshold (level 4 at 220 XP unlocks the basic strategy chart).

**Expect**: level-up announced; the guide is usable without a reload; locked guides show their
required level but not their contents.

**Automated**: `npm run test:unit -- progression` and `npm run test:e2e -- progression`

### V8 — Keyboard only (NFR-008)

Unplug the mouse. Play a full hand using only the keyboard.

**Expect**: every action reachable and operable; focus always visible.

**Automated**: `npm run test:e2e -- keyboard`

### V9 — No credential in the bundle (constitution Data Safety gate)

```bash
npm run build
npm run check:bundle
```

**Expect**: exits 0. It greps the built output for the service key and any `SUPABASE_SERVICE`
string. **A non-zero exit is a release blocker, not a warning.**

---

## Full gate run

Mirrors CI, in constitution order:

```bash
npm run typecheck        # 1. strict TS
npm run lint             # 2. eslint incl. engine import-boundary rule
npm run test:unit        # 3. unit + integration — must finish < 30s
npm run test:coverage    # 4. ≥ 90% on src/engine and src/strategy
npm run check:bundle     # 5. no credential in client output
npm run test:e2e         # 6. Playwright — exempt from the 30s budget
```

## Deploy

```bash
vercel --prod
```

Set `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` in Vercel project settings as **server-side**
environment variables. If either appears with a `VITE_` prefix, `check:bundle` will fail — by
design.

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| Sync indicator never clears | `api/` not running (`npm run dev` instead of `vercel dev`), or env vars unset. Gameplay is unaffected — this is FR-062 working. |
| `strategy/data/*.json not found` | `npm run generate:ev` has not been run. |
| EV numbers disagree with a published chart | Generator bug, not a chart disagreement — see research.md R1. Fix the generator; do not adjust the table by hand. |
| Unit suite exceeds 30s | A browser-dependent test leaked into `tests/unit/`. Engine tests run in Node and must not import React. |
