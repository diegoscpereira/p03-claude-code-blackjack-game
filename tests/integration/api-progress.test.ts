import { beforeEach, describe, expect, it } from 'vitest';
import { createProgressHandler } from '../../api/progress';
import { PLAYER_A, fakeStore, invoke, progressBody, type FakeStore } from '../helpers/api';

/**
 * T095 — contracts/http-api.md: `GET` and `PUT /api/progress`.
 *
 * The clause this file is really built around is the one that reads oddly until
 * you see why: **404 is not an error**. A player who has never synced has no
 * row, and treating that as a failure would put an error path in front of every
 * first-time visitor — exactly what FR-066 forbids.
 */

let store: FakeStore;
let handler: ReturnType<typeof createProgressHandler>;

beforeEach(() => {
  store = fakeStore();
  handler = createProgressHandler(store);
});

describe('GET /api/progress (FR-064, FR-066)', () => {
  it('FR-066: returns 404 for a player who has never synced', async () => {
    const result = await invoke(handler, { method: 'GET', query: { player_id: PLAYER_A } });
    expect(result.status).toBe(404);
  });

  it('FR-064: returns the stored row for a known player', async () => {
    await invoke(handler, { method: 'PUT', body: progressBody() });

    const result = await invoke(handler, { method: 'GET', query: { player_id: PLAYER_A } });

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ player_id: PLAYER_A, xp: 224, level: 4 });
  });

  it('FR-024a: never returns a stored EV accuracy score', async () => {
    await invoke(handler, { method: 'PUT', body: progressBody() });
    const result = await invoke(handler, { method: 'GET', query: { player_id: PLAYER_A } });
    // data-model.md: the score is derived from two counters on read. A column
    // would be able to disagree with its own inputs after a partial sync.
    expect(result.body).not.toHaveProperty('ev_accuracy');
    expect(result.body).toMatchObject({ decisions_taken: 64, decisions_matched: 51 });
  });

  it('FR-069: rejects a read with no player_id', async () => {
    const result = await invoke(handler, { method: 'GET', query: {} });
    expect(result.status).toBe(400);
    expect(result.body).toHaveProperty('error');
  });

  it('FR-062: surfaces a store outage as a retryable 5xx', async () => {
    store.failNext();
    const result = await invoke(handler, { method: 'GET', query: { player_id: PLAYER_A } });
    expect(result.status).toBeGreaterThanOrEqual(500);
  });
});

describe('PUT /api/progress merge semantics (R4)', () => {
  it('creates the row on a first write', async () => {
    const result = await invoke(handler, { method: 'PUT', body: progressBody() });
    expect(result.status).toBe(200);
    expect(store.progressRows.get(PLAYER_A)).toMatchObject({ xp: 224 });
  });

  it('R4: counters take the greater of stored and incoming', async () => {
    await invoke(handler, { method: 'PUT', body: progressBody({ xp: 500, hands_played: 90 }) });

    const result = await invoke(handler, { method: 'PUT', body: progressBody({ xp: 224, hands_played: 37 }) });

    // A late-arriving retry of an older payload must not roll progression back.
    expect(result.body).toMatchObject({ xp: 500, hands_played: 90 });
  });

  it('R4: unlocks merge as a union, never a replacement', async () => {
    await invoke(handler, { method: 'PUT', body: progressBody({ unlocks: ['post_game_analysis'] }) });

    const result = await invoke(handler, {
      method: 'PUT',
      body: progressBody({ unlocks: ['basic_strategy_chart'] }),
    });

    expect(result.body).toMatchObject({
      unlocks: expect.arrayContaining(['post_game_analysis', 'basic_strategy_chart']),
    });
    expect((result.body as { unlocks: string[] }).unlocks).toHaveLength(2);
  });

  it('boundary rule 4: bankroll takes the incoming value, because local play is authoritative', async () => {
    await invoke(handler, { method: 'PUT', body: progressBody({ bankroll: 2000 }) });
    const result = await invoke(handler, { method: 'PUT', body: progressBody({ bankroll: 300 }) });
    expect(result.body).toMatchObject({ bankroll: 300 });
  });

  it('boundary rule 4: level and net bankroll change take the incoming value', async () => {
    await invoke(handler, { method: 'PUT', body: progressBody({ level: 9, net_bankroll_change: 400 }) });
    const result = await invoke(handler, {
      method: 'PUT',
      body: progressBody({ level: 4, net_bankroll_change: -45 }),
    });
    expect(result.body).toMatchObject({ level: 4, net_bankroll_change: -45 });
  });

  it('FR-071: the same payload applied twice produces the same row', async () => {
    const first = await invoke(handler, { method: 'PUT', body: progressBody() });
    const second = await invoke(handler, { method: 'PUT', body: progressBody() });
    expect(second.body).toEqual(first.body);
  });
});

describe('PUT /api/progress validation (FR-070)', () => {
  it('FR-069: rejects a write with no player_id', async () => {
    const result = await invoke(handler, { method: 'PUT', body: progressBody({ player_id: undefined }) });
    expect(result.status).toBe(400);
    expect(store.progressRows.size).toBe(0);
  });

  it('FR-069: rejects a player_id that is not a uuid', async () => {
    const result = await invoke(handler, { method: 'PUT', body: progressBody({ player_id: 'me' }) });
    expect(result.status).toBe(400);
  });

  it('FR-070: rejects a negative counter without writing anything', async () => {
    const result = await invoke(handler, { method: 'PUT', body: progressBody({ xp: -5 }) });
    expect(result.status).toBe(400);
    expect(store.progressRows.size).toBe(0);
  });

  it('FR-070: rejects a level outside the ladder', async () => {
    expect((await invoke(handler, { method: 'PUT', body: progressBody({ level: 0 }) })).status).toBe(400);
    expect((await invoke(handler, { method: 'PUT', body: progressBody({ level: 11 }) })).status).toBe(400);
  });

  it('FR-070: rejects a non-object body', async () => {
    expect((await invoke(handler, { method: 'PUT', body: 'nope' })).status).toBe(400);
    expect((await invoke(handler, { method: 'PUT', body: null })).status).toBe(400);
  });

  it('FR-070: rejects unlocks that are not an array of strings', async () => {
    const result = await invoke(handler, { method: 'PUT', body: progressBody({ unlocks: 'all' }) });
    expect(result.status).toBe(400);
  });

  it('FR-054: ignores any field outside the schema rather than storing it', async () => {
    await invoke(handler, { method: 'PUT', body: progressBody({ email: 'someone@example.com' }) });
    // FR-054 is a promise about what is *stored*, so the handler must not be a
    // pass-through for whatever the client happens to send.
    expect(store.progressRows.get(PLAYER_A)).not.toHaveProperty('email');
  });

  it('rejects an unsupported method', async () => {
    const result = await invoke(handler, { method: 'DELETE', query: { player_id: PLAYER_A } });
    expect(result.status).toBe(405);
  });
});
