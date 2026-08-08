import { beforeEach, describe, expect, it } from 'vitest';
import { createProgressHandler } from '../../api/progress';
import { createHandsHandler } from '../../api/hands';
import { getPlayerId, readPlayerId } from '../../src/sync/identity';
import { reconcile } from '../../src/sync/reconcile';
import { toProgressBody } from '../../src/sync/records';
import type { ProgressSnapshot } from '../../src/sync/records';
import { clearLocalState } from '../../src/sync/storage';
import { fakeStore, handBody, invoke, type FakeStore } from '../helpers/api';

/**
 * T127 — the two-tab case (spec Edge Cases).
 *
 * > *"No concurrency beyond one player across two tabs."* (plan.md)
 *
 * Two tabs share `localStorage`, so they share an identity — and they each hold
 * their own in-memory game state, so they can settle hands independently and
 * write to the same row. This is the only concurrency the design admits, and
 * the three properties it must have are: one identity, counters that converge
 * upward rather than to whichever tab wrote last, and hand logs from both tabs
 * retained rather than one overwriting the other.
 *
 * The second property is the one worth stating carefully. "Later write wins" is
 * true for the *bankroll*, which is a current value. It is emphatically false
 * for counters: a later write carrying smaller totals must not roll them back,
 * because the two tabs counted different hands.
 */

let store: FakeStore;
let progress: ReturnType<typeof createProgressHandler>;
let hands: ReturnType<typeof createHandsHandler>;

const snapshot = (overrides: Partial<ProgressSnapshot> = {}): ProgressSnapshot => ({
  level: 2,
  xp: 60,
  handsPlayed: 5,
  wins: 3,
  losses: 2,
  pushes: 0,
  netBankrollChange: 10,
  bankroll: 1010,
  decisionsTaken: 7,
  decisionsMatched: 5,
  unlocks: ['post_game_analysis'],
  bankrollResets: 0,
  ...overrides,
});

beforeEach(() => {
  clearLocalState();
  store = fakeStore();
  progress = createProgressHandler(store);
  hands = createHandsHandler(store);
});

describe('shared identity (FR-053)', () => {
  it('FR-053: both tabs resolve to the same player id', () => {
    // Two tabs are two calls against one `localStorage`. The second must find
    // what the first created rather than minting a rival identity — otherwise
    // the player would silently become two players with split progression.
    const tabA = getPlayerId();
    const tabB = getPlayerId();

    expect(tabB).toBe(tabA);
    expect(readPlayerId()).toBe(tabA);
  });

  it('FR-053: a tab opened later adopts the existing identity, not a new one', () => {
    const first = getPlayerId();
    // A later tab reads storage fresh, exactly as a reload would.
    expect(readPlayerId()).toBe(first);
    expect(getPlayerId()).toBe(first);
  });
});

describe('counters converge upward, not to the last writer (boundary rule 4)', () => {
  it('boundary rule 4: the higher counter survives, whichever tab wrote last', async () => {
    const playerId = getPlayerId();

    // Tab A has played more hands; tab B writes afterwards with lower totals.
    await invoke(progress, {
      method: 'PUT',
      body: toProgressBody(playerId, snapshot({ xp: 400, handsPlayed: 30 })),
    });
    const result = await invoke(progress, {
      method: 'PUT',
      body: toProgressBody(playerId, snapshot({ xp: 120, handsPlayed: 9 })),
    });

    expect(result.body).toMatchObject({ xp: 400, hands_played: 30 });
  });

  it('boundary rule 4: the bankroll does take the later write', async () => {
    const playerId = getPlayerId();

    await invoke(progress, { method: 'PUT', body: toProgressBody(playerId, snapshot({ bankroll: 2000 })) });
    const result = await invoke(progress, {
      method: 'PUT',
      body: toProgressBody(playerId, snapshot({ bankroll: 640 })),
    });

    // A current value, not a lifetime total. Taking the maximum here would hand
    // the player free chips every time the other tab synced.
    expect(result.body).toMatchObject({ bankroll: 640 });
  });

  it('boundary rule 4: unlocks earned in either tab are both kept', async () => {
    const playerId = getPlayerId();

    await invoke(progress, {
      method: 'PUT',
      body: toProgressBody(playerId, snapshot({ unlocks: ['post_game_analysis'] })),
    });
    const result = await invoke(progress, {
      method: 'PUT',
      body: toProgressBody(playerId, snapshot({ unlocks: ['basic_strategy_chart'] })),
    });

    expect((result.body as { unlocks: string[] }).unlocks).toHaveLength(2);
  });

  it('boundary rule 4: interleaved writes from both tabs converge to the maximum', async () => {
    const playerId = getPlayerId();

    for (let i = 1; i <= 6; i += 1) {
      await invoke(progress, {
        method: 'PUT',
        body: toProgressBody(playerId, snapshot({ xp: i * 10, handsPlayed: i })),
      });
      await invoke(progress, {
        method: 'PUT',
        body: toProgressBody(playerId, snapshot({ xp: i * 7, handsPlayed: i - 1 })),
      });
    }

    expect(store.progressRows.get(playerId)).toMatchObject({ xp: 60, hands_played: 6 });
  });

  it('boundary rule 4: a tab reconciling on reload sees the merged totals', async () => {
    const playerId = getPlayerId();
    await invoke(progress, {
      method: 'PUT',
      body: toProgressBody(playerId, snapshot({ xp: 400, handsPlayed: 30 })),
    });

    const remote = await invoke(progress, { method: 'GET', query: { player_id: playerId } });
    const local = snapshot({ xp: 120, handsPlayed: 9, bankroll: 700 });

    const merged = reconcile(local, {
      ...local,
      xp: (remote.body as { xp: number }).xp,
      handsPlayed: (remote.body as { hands_played: number }).hands_played,
    });

    expect(merged.xp).toBe(400);
    expect(merged.handsPlayed).toBe(30);
    // Local play stays authoritative for the live figure.
    expect(merged.bankroll).toBe(700);
  });
});

describe('both tabs keep their hand logs (FR-067, FR-071)', () => {
  it('FR-067: hands from either tab are retained, not overwritten', async () => {
    const playerId = getPlayerId();

    await invoke(hands, {
      method: 'POST',
      body: {
        player_id: playerId,
        hands: [handBody({ hand_id: 'aaaaaaaa-1111-4111-8111-111111111111' })],
      },
    });
    await invoke(hands, {
      method: 'POST',
      body: {
        player_id: playerId,
        hands: [handBody({ hand_id: 'bbbbbbbb-2222-4222-8222-222222222222' })],
      },
    });

    // Append-only: two tabs playing simultaneously produce two rows, and
    // neither is a conflict.
    expect(store.handRows.size).toBe(2);
    expect([...store.handRows.values()].every((row) => row.player_id === playerId)).toBe(true);
  });

  it('FR-071: the same hand synced by both tabs still lands once', async () => {
    const playerId = getPlayerId();
    const duplicate = handBody({ hand_id: 'cccccccc-3333-4333-8333-333333333333' });

    await invoke(hands, { method: 'POST', body: { player_id: playerId, hands: [duplicate] } });
    const second = await invoke(hands, { method: 'POST', body: { player_id: playerId, hands: [duplicate] } });

    expect(second.body).toEqual({ inserted: 0, skipped: 1 });
    expect(store.handRows.size).toBe(1);
  });
});
