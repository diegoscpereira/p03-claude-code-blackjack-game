# Contract: Game Engine Public API

**Module**: `src/engine` | **Consumers**: `src/store`, `src/bots`, `src/strategy`, tests

This is the contract User Story 7 asks a reviewer to be able to read and trust. Two rules
govern everything below:

1. **Every function is pure.** No I/O, no DOM, no network, no `Date.now()`, no `Math.random()`.
2. **Every function is total.** Illegal input returns a typed result, never throws.

Violating either is a constitution Principle I failure, and the ESLint boundary rule plus the
Node-environment test suite exist to catch it.

---

## Types

```ts
type Rank = 'A'|'2'|'3'|'4'|'5'|'6'|'7'|'8'|'9'|'10'|'J'|'Q'|'K';
type Suit = '♠'|'♥'|'♦'|'♣';
type Card = { rank: Rank; suit: Suit };

// The single source of the action vocabulary (constitution Principle III).
// Every other layer imports this; none redefines it.
type Action = 'hit' | 'stand' | 'double' | 'split' | 'surrender';

type Outcome = 'win' | 'loss' | 'push' | 'blackjack' | 'bust';

interface Rng {
  /** Returns a float in [0, 1). Seeded and reproducible. */
  next(): number;
}

interface HouseRules {
  decks: number;              // 6
  dealerHitsSoft17: boolean;  // true
  blackjackPays: number;      // 1.5
  maxHands: number;           // 4
  doubleAfterSplit: boolean;  // true
  surrenderAllowed: boolean;  // false in Phase 1
  penetration: number;        // 0.75
}
```

`surrender` is present in the vocabulary but is not offered in Phase 1 (spec Out of Scope).
It exists in the type so that adding it later is a rules-flag change, not a vocabulary change
that would ripple through every layer.

---

## `rng.ts`

```ts
function createRng(seed: number): Rng;
```

**Guarantee**: `createRng(n)` and `createRng(n)` produce identical sequences, in any process,
on any platform, forever. This is the foundation of FR-004 and SC-008 — if it is not true,
nothing downstream is reproducible.

---

## `hand.ts`

```ts
function handTotal(cards: Card[]): { total: number; isSoft: boolean };
function isBust(cards: Card[]): boolean;
function isNatural(hand: Hand): boolean;
```

**`handTotal`** implements FR-001: Aces count 11 unless that exceeds 21, then 1. `isSoft` is
true when an Ace is still counted as 11.

**`isNatural`** is true only for exactly two cards totalling 21 on an unsplit hand — a ten on
a split Ace is 21 but not a natural (FR-011).

| Input | `total` | `isSoft` |
|---|---|---|
| `A,6` | 17 | true |
| `A,6,10` | 17 | false |
| `A,A` | 12 | true |
| `A,A,9` | 21 | true |
| `10,6` | 16 | false |

---

## `rules.ts`

```ts
function legalActions(state: RoundState, rules: HouseRules): Action[];
```

**Guarantee**: the UI renders exactly this set and nothing else (FR-002, Principle III). If an
action is absent here, no path in the UI may offer it.

Encodes: `double` requires exactly two cards and sufficient bankroll; `split` requires a pair
and `playerHands.length < rules.maxHands` (FR-010); a split-Ace hand returns `[]` because it
auto-stands (FR-011); a resolved hand returns `[]`.

---

## `round.ts` — the reducer

```ts
function applyAction(
  state: RoundState,
  action: Action,
  rules: HouseRules,
  rng: Rng
): RoundState;

function startRound(
  seed: number, bet: number, rules: HouseRules, botSeats: BotProfile[]
): RoundState;
```

**Guarantees**:
- Returns a new state; the input is never mutated.
- An action not in `legalActions(state)` returns the state **unchanged** — no throw, no
  partial mutation. This is what makes FR-015's double-click protection a property of the
  engine rather than of a UI guard.
- `applyAction(applyAction(s, a), b)` is deterministic given the same `rng`.

---

## `dealer.ts` / `settle.ts`

```ts
function playDealer(state: RoundState, rules: HouseRules, rng: Rng): RoundState;
function settle(state: RoundState, rules: HouseRules): SettledRound;

type SettledRound = {
  hands: { handId: string; outcome: Outcome; netChange: number }[];
  totalNetChange: number;
  handLog: HandLogRecord;   // shape in data-model.md
};
```

`playDealer` implements FR-012 (draw to hard 17, hit soft 17). `settle` implements FR-013
(3:2 naturals, 1:1 wins, pushes) and emits the record FR-014 requires.

**Invariant**: `totalNetChange` equals the sum of per-hand `netChange`. This is the assertion
that catches payout bugs, and it belongs in every settlement test.

---

## Strategy module surface

`src/strategy` is not part of the engine but obeys the same purity rules.

```ts
function rankActions(
  state: RoundState, rules: HouseRules
): { action: Action; ev: number }[];        // descending by ev

function recommend(state: RoundState, rules: HouseRules): Action;
function explain(state: RoundState, action: Action): string | null;
```

**Guarantees**:
- `rankActions` returns one entry per legal action, sorted descending. Synchronous lookup
  against the generated tables — no computation, no await (NFR-002).
- `recommend` equals `rankActions(...)[0].action` and matches the published chart at every
  charted decision point (FR-021).
- `explain` returns `null` rather than placeholder text when no entry exists, which is what
  FR-027 requires the UI to handle.

---

## What this module must never contain

Stated explicitly because it is the review checklist for User Story 7:

- No `import` from `react`, `zustand`, `src/ui`, `src/store`, `src/sync`, or `@supabase/*`
- No `fetch`, `localStorage`, `window`, or `document`
- No `Date.now()` or `new Date()`
- No `Math.random()`
- No `throw` on illegal-but-expected input
