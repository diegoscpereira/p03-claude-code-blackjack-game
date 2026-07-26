# Contract: HTTP Persistence API

**Location**: `api/` (Vercel Functions) | **Consumers**: `src/sync/client.ts` only

Two endpoints, both off the interactive path. The client may call them or not; gameplay is
identical either way (FR-060, FR-062). Every handler is stateless (constitution: Additional
Constraints) and holds the only copy of the database credential in the system.

**Universal rules**:
- All requests carry `player_id` (uuid). A request without it is rejected 400 — the endpoint
  has no other way to scope a row (FR-069).
- No endpoint accepts a table name, column list, or filter expression from the client.
- Handlers never return another player's data under any parameter combination.
- Responses are JSON. Errors return `{ error: string }` and a status the client can act on.

---

## `GET /api/progress?player_id={uuid}`

Read a player's progression at session start (FR-064).

**200** — player exists:

```json
{
  "player_id": "…", "level": 4, "xp": 224,
  "hands_played": 37, "wins": 18, "losses": 16, "pushes": 3,
  "net_bankroll_change": -45, "bankroll": 955,
  "decisions_taken": 64, "decisions_matched": 51,
  "unlocks": ["post_game_analysis", "basic_strategy_chart"],
  "bankroll_resets": 0
}
```

**404** — no such player. **This is not an error condition.** The client creates a fresh local
player and begins play immediately (FR-066); the row appears on the first `PUT`.

`ev_accuracy` is deliberately absent — the client derives it from the two counters (FR-024a).

---

## `PUT /api/progress`

Write progression after a hand settles. **Idempotent by construction** (R4).

Request:

```json
{
  "player_id": "…", "level": 4, "xp": 224,
  "hands_played": 37, "wins": 18, "losses": 16, "pushes": 3,
  "net_bankroll_change": -45, "bankroll": 955,
  "decisions_taken": 64, "decisions_matched": 51,
  "unlocks": ["post_game_analysis"], "bankroll_resets": 0
}
```

**Merge semantics** — the heart of this contract:

| Field group | Rule |
|---|---|
| `xp`, `hands_played`, `wins`, `losses`, `pushes`, `decisions_taken`, `decisions_matched`, `bankroll_resets` | `GREATEST(existing, incoming)` |
| `unlocks` | array union |
| `level`, `bankroll`, `net_bankroll_change` | take incoming (local is authoritative, boundary rule 4) |

Counters are absolute totals, never deltas. This is why a duplicate retry is harmless: the
same payload applied twice produces the same row. Sending deltas would make retry a
correctness bug (R4).

**200** with the merged row. **400** on missing `player_id` or a counter that fails
validation. **5xx** — the client keeps the record queued and retries with backoff (FR-062).

---

## `POST /api/hands`

Append hand logs in batches (FR-061, FR-067).

Request:

```json
{
  "player_id": "…",
  "hands": [
    {
      "hand_id": "…",
      "played_at": "2026-07-26T18:22:41.000Z",
      "seed": 918273645,
      "dealer_upcard": "10",
      "actions": [{ "hand_id": "h1", "action": "hit" }],
      "decisions": [
        { "player_total": 16, "is_soft": false, "dealer_upcard": "10",
          "chosen": "hit", "recommended": "hit", "matched": true }
      ],
      "final_totals": { "player": [21], "dealer": 19 },
      "outcome": "win",
      "net_change": 10
    }
  ]
}
```

Batch limit: 50 hands per request.

**Idempotency**: `INSERT … ON CONFLICT (hand_id) DO NOTHING`. `hand_id` is client-generated at
settlement, so a retry after an ambiguous failure inserts nothing and still returns 200 — this
is FR-071, and the integration test asserting "exactly one log after a retry" tests precisely
this line.

**200**: `{ "inserted": 1, "skipped": 0 }` — `skipped` counts records that already existed,
which is a normal outcome, not a warning.

**400** on a malformed batch — no partial writes (FR-070). Either every record in the batch is
valid, or none is written.

---

## Client-side behaviour (`src/sync`)

Part of the contract because the endpoints' guarantees only hold if the client behaves:

1. **Never awaited on an interactive path.** `enqueue()` is synchronous and writes to
   `localStorage`; the drain is a background task (NFR-001).
2. **Drains** on an interval, on `online`, and at session start before restoring state
   (FR-064).
3. **Retries** with exponential backoff and jitter. Retries are safe by R4 and need no
   coordination.
4. **Caps** the queue at 500 records, dropping oldest and counting drops (bounded memory).
5. **Surfaces failure passively only** — the sync indicator (FR-063). Never a modal, never a
   blocked control (Principle III).

---

## Deliberately absent

| Not built | Why |
|---|---|
| Authentication | Device-scoped UUID identity; no accounts in Phase 1 (spec Out of Scope) |
| RLS policies | Excluded by explicit direction (FR-065); the server-side boundary replaces them |
| `DELETE` endpoints | Nothing in Phase 1 deletes; hand logs are append-only |
| Rate limiting | Flagged as outstanding in the clarification coverage summary; low impact at demo scale, worth revisiting before public launch |
| An LLM proxy route | Phase 1 has no runtime model call (decision D1). The directory is shaped to accept one later without touching the game path |
