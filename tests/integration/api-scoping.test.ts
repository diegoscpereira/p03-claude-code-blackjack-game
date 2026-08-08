import { beforeEach, describe, expect, it } from 'vitest';
import { createProgressHandler } from '../../api/progress';
import { createHandsHandler } from '../../api/hands';
import { PLAYER_A, PLAYER_B, fakeStore, handBody, invoke, progressBody, type FakeStore } from '../helpers/api';

/**
 * T096a — FR-069 and NFR-005: the identifier is the *only* scope.
 *
 * There is no row-level security here (FR-065), so these handlers are the whole
 * access-control story. That is a deliberate, documented trade — see
 * docs/adr/0002 — and it is only defensible if the scoping is airtight and
 * tested as such rather than assumed from a code read.
 */

let store: FakeStore;
let progress: ReturnType<typeof createProgressHandler>;
let hands: ReturnType<typeof createHandsHandler>;

beforeEach(() => {
  store = fakeStore();
  progress = createProgressHandler(store);
  hands = createHandsHandler(store);
});

describe('player_id is mandatory (FR-069)', () => {
  it('FR-069: GET /api/progress without player_id is 400', async () => {
    expect((await invoke(progress, { method: 'GET', query: {} })).status).toBe(400);
  });

  it('FR-069: PUT /api/progress without player_id is 400', async () => {
    const result = await invoke(progress, { method: 'PUT', body: progressBody({ player_id: undefined }) });
    expect(result.status).toBe(400);
  });

  it('FR-069: POST /api/hands without player_id is 400', async () => {
    const result = await invoke(hands, { method: 'POST', body: { hands: [handBody()] } });
    expect(result.status).toBe(400);
    expect(store.handRows.size).toBe(0);
  });

  it('FR-069: an empty or whitespace player_id is rejected, not treated as present', async () => {
    expect((await invoke(progress, { method: 'GET', query: { player_id: '' } })).status).toBe(400);
    expect((await invoke(progress, { method: 'GET', query: { player_id: '   ' } })).status).toBe(400);
  });

  it('FR-069: a repeated player_id query parameter is rejected rather than resolved', async () => {
    // Query parsers surface `?player_id=a&player_id=b` as an array. Picking one
    // would be a scope decision made by accident.
    const result = await invoke(progress, { method: 'GET', query: { player_id: [PLAYER_A, PLAYER_B] } });
    expect(result.status).toBe(400);
  });
});

describe('no other parameter can address another player (FR-069)', () => {
  beforeEach(async () => {
    await invoke(progress, { method: 'PUT', body: progressBody({ player_id: PLAYER_A, xp: 100 }) });
    await invoke(progress, { method: 'PUT', body: progressBody({ player_id: PLAYER_B, xp: 900 }) });
  });

  it('FR-069: a read returns only the requested identifier', async () => {
    const result = await invoke(progress, { method: 'GET', query: { player_id: PLAYER_A } });
    expect(result.body).toMatchObject({ player_id: PLAYER_A, xp: 100 });
  });

  it('FR-069: extra query parameters cannot widen or redirect the scope', async () => {
    const result = await invoke(progress, {
      method: 'GET',
      query: { player_id: PLAYER_A, id: PLAYER_B, filter: 'true', select: '*', table: 'user_progress' },
    });
    expect(result.body).toMatchObject({ player_id: PLAYER_A, xp: 100 });
  });

  it('FR-069: a body field cannot override the identifier a write is scoped to', async () => {
    await invoke(progress, {
      method: 'PUT',
      body: progressBody({ player_id: PLAYER_A, xp: 150, id: PLAYER_B, target: PLAYER_B }),
    });
    expect(store.progressRows.get(PLAYER_B)).toMatchObject({ xp: 900 });
  });

  it('FR-069: hand rows are stamped with the request identifier, not one from the record', async () => {
    await invoke(hands, {
      method: 'POST',
      body: { player_id: PLAYER_A, hands: [handBody({ player_id: PLAYER_B })] },
    });
    const row = [...store.handRows.values()][0];
    expect(row?.player_id).toBe(PLAYER_A);
  });

  it('FR-068: no endpoint accepts a table name, column list, or filter expression', async () => {
    const result = await invoke(progress, {
      method: 'GET',
      query: { player_id: PLAYER_A, columns: 'player_id,xp', where: "xp > 0", order: 'xp.desc' },
    });
    // Whatever the client sends, the shape of the response is fixed by the
    // handler — contracts/http-api.md, universal rule 2.
    expect(result.status).toBe(200);
    expect(Object.keys(result.body as object)).toContain('hands_played');
  });

  it('FR-069: a response never contains an identifier other than the one requested', async () => {
    const result = await invoke(progress, { method: 'GET', query: { player_id: PLAYER_A } });
    expect(JSON.stringify(result.body)).not.toContain(PLAYER_B);
  });
});

describe('handlers are stateless (NFR-005, constitution: Architecture)', () => {
  it('NFR-005: two sequential reads for different players do not bleed through', async () => {
    await invoke(progress, { method: 'PUT', body: progressBody({ player_id: PLAYER_A, xp: 100 }) });
    await invoke(progress, { method: 'PUT', body: progressBody({ player_id: PLAYER_B, xp: 900 }) });

    const a = await invoke(progress, { method: 'GET', query: { player_id: PLAYER_A } });
    const b = await invoke(progress, { method: 'GET', query: { player_id: PLAYER_B } });
    const aAgain = await invoke(progress, { method: 'GET', query: { player_id: PLAYER_A } });

    expect(a.body).toMatchObject({ player_id: PLAYER_A, xp: 100 });
    expect(b.body).toMatchObject({ player_id: PLAYER_B, xp: 900 });
    expect(aAgain.body).toEqual(a.body);
  });

  it('NFR-005: a fresh handler over the same store behaves identically', async () => {
    await invoke(progress, { method: 'PUT', body: progressBody({ player_id: PLAYER_A, xp: 100 }) });

    // A serverless invocation may land on a cold instance. If any state that
    // mattered lived at module scope, this is where it would show up.
    const rebuilt = createProgressHandler(store);
    const result = await invoke(rebuilt, { method: 'GET', query: { player_id: PLAYER_A } });

    expect(result.body).toMatchObject({ player_id: PLAYER_A, xp: 100 });
  });

  it('NFR-005: interleaved writes for two players stay independent', async () => {
    for (let i = 1; i <= 5; i += 1) {
      await invoke(progress, { method: 'PUT', body: progressBody({ player_id: PLAYER_A, xp: i * 10 }) });
      await invoke(progress, { method: 'PUT', body: progressBody({ player_id: PLAYER_B, xp: i * 100 }) });
    }
    expect(store.progressRows.get(PLAYER_A)).toMatchObject({ xp: 50 });
    expect(store.progressRows.get(PLAYER_B)).toMatchObject({ xp: 500 });
  });

  it('NFR-005: a batch write is scoped per request, not per instance', async () => {
    await invoke(hands, {
      method: 'POST',
      body: { player_id: PLAYER_A, hands: [handBody({ hand_id: '11111111-1111-4111-8111-111111111111' })] },
    });
    await invoke(hands, {
      method: 'POST',
      body: { player_id: PLAYER_B, hands: [handBody({ hand_id: '22222222-2222-4222-8222-222222222222' })] },
    });

    const owners = [...store.handRows.values()].map((row) => row.player_id);
    expect(owners).toEqual([PLAYER_A, PLAYER_B]);
  });
});
