import { beforeEach, describe, expect, it } from 'vitest';
import { createHandsHandler } from '../../api/hands';
import { PLAYER_A, fakeStore, handBody, invoke, type FakeStore } from '../helpers/api';

/**
 * T096 — contracts/http-api.md: `POST /api/hands`.
 *
 * Two guarantees carry the whole persistence story. Idempotency by `hand_id`
 * (FR-071) is what makes a retrying outbox safe, and all-or-nothing batches
 * (FR-070) are what make a rejected batch safe to retry unchanged — a partial
 * write would leave the client with no correct next move.
 */

let store: FakeStore;
let handler: ReturnType<typeof createHandsHandler>;

const batch = (hands: unknown[], playerId: string = PLAYER_A) => ({
  method: 'POST',
  body: { player_id: playerId, hands },
});

beforeEach(() => {
  store = fakeStore();
  handler = createHandsHandler(store);
});

describe('POST /api/hands (FR-061, FR-067)', () => {
  it('inserts a batch and reports what it wrote', async () => {
    const result = await invoke(handler, batch([handBody()]));
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ inserted: 1, skipped: 0 });
    expect(store.handRows.size).toBe(1);
  });

  it('FR-067: stores everything needed to reconstruct the hand', async () => {
    await invoke(handler, batch([handBody()]));
    const row = [...store.handRows.values()][0];
    expect(row).toMatchObject({
      player_id: PLAYER_A,
      seed: 918273645,
      dealer_upcard: '10',
      outcome: 'win',
      net_change: 10,
    });
    expect(row?.actions).toBeDefined();
    expect(row?.decisions).toBeDefined();
  });

  it('accepts several hands in one request', async () => {
    const result = await invoke(
      handler,
      batch([handBody({ hand_id: '11111111-1111-4111-8111-111111111111' }), handBody({ hand_id: '22222222-2222-4222-8222-222222222222' })]),
    );
    expect(result.body).toEqual({ inserted: 2, skipped: 0 });
  });

  it('accepts an empty batch as a no-op', async () => {
    const result = await invoke(handler, batch([]));
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ inserted: 0, skipped: 0 });
  });
});

describe('idempotency (FR-071)', () => {
  it('FR-071: a retried hand is skipped, not duplicated, and still returns 200', async () => {
    await invoke(handler, batch([handBody()]));

    const retry = await invoke(handler, batch([handBody()]));

    expect(retry.status).toBe(200);
    expect(retry.body).toEqual({ inserted: 0, skipped: 1 });
    expect(store.handRows.size).toBe(1);
  });

  it('FR-071: a batch mixing new and already-stored hands inserts only the new ones', async () => {
    await invoke(handler, batch([handBody({ hand_id: '11111111-1111-4111-8111-111111111111' })]));

    const result = await invoke(
      handler,
      batch([
        handBody({ hand_id: '11111111-1111-4111-8111-111111111111' }),
        handBody({ hand_id: '22222222-2222-4222-8222-222222222222' }),
      ]),
    );

    expect(result.body).toEqual({ inserted: 1, skipped: 1 });
  });

  it('FR-071: duplicate hand_ids inside a single batch are collapsed', async () => {
    const result = await invoke(handler, batch([handBody(), handBody()]));
    expect(store.handRows.size).toBe(1);
    expect(result.status).toBe(200);
  });
});

describe('batch validation (FR-070)', () => {
  it('FR-070: rejects a batch over the 50-record limit', async () => {
    const hands = Array.from({ length: 51 }, (_, i) =>
      handBody({ hand_id: `${i.toString().padStart(8, '0')}-1111-4111-8111-111111111111` }),
    );
    const result = await invoke(handler, batch(hands));
    expect(result.status).toBe(400);
    expect(store.handRows.size).toBe(0);
  });

  it('FR-070: accepts a batch of exactly 50', async () => {
    const hands = Array.from({ length: 50 }, (_, i) =>
      handBody({ hand_id: `${i.toString().padStart(8, '0')}-1111-4111-8111-111111111111` }),
    );
    const result = await invoke(handler, batch(hands));
    expect(result.status).toBe(200);
  });

  it('FR-070: one malformed record rejects the whole batch with no partial write', async () => {
    const result = await invoke(
      handler,
      batch([handBody(), handBody({ hand_id: 'not-a-uuid', outcome: 'win' })]),
    );
    expect(result.status).toBe(400);
    // The valid record in the same batch must not have landed — otherwise a
    // client retrying the corrected batch could not reason about what exists.
    expect(store.handRows.size).toBe(0);
  });

  it('FR-070: rejects an outcome outside the schema check constraint', async () => {
    const result = await invoke(handler, batch([handBody({ outcome: 'jackpot' })]));
    expect(result.status).toBe(400);
    expect(store.handRows.size).toBe(0);
  });

  it('FR-070: rejects a missing hands array', async () => {
    const result = await invoke(handler, { method: 'POST', body: { player_id: PLAYER_A } });
    expect(result.status).toBe(400);
  });

  it('FR-070: rejects a non-object body', async () => {
    expect((await invoke(handler, { method: 'POST', body: 'nope' })).status).toBe(400);
  });

  it('FR-070: rejects a non-numeric net_change', async () => {
    const result = await invoke(handler, batch([handBody({ net_change: 'ten' })]));
    expect(result.status).toBe(400);
  });

  it('FR-062: a store outage returns a retryable 5xx with nothing written', async () => {
    store.failNext();
    const result = await invoke(handler, batch([handBody()]));
    expect(result.status).toBeGreaterThanOrEqual(500);
    expect(store.handRows.size).toBe(0);
  });

  it('rejects an unsupported method', async () => {
    const result = await invoke(handler, { method: 'GET', query: { player_id: PLAYER_A } });
    expect(result.status).toBe(405);
  });

  it('FR-054: stores no field outside the schema', async () => {
    await invoke(handler, batch([handBody({ nickname: 'Diego' })]));
    const row = [...store.handRows.values()][0];
    expect(row).not.toHaveProperty('nickname');
  });
});
