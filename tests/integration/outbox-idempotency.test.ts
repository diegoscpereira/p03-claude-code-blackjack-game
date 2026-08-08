import { beforeEach, describe, expect, it } from 'vitest';
import { createProgressHandler } from '../../api/progress';
import { createHandsHandler } from '../../api/hands';
import {
  clearOutbox,
  drainOutbox,
  enqueueHand,
  enqueueProgress,
  pendingCount,
} from '../../src/sync/outbox';
import { clearLocalState } from '../../src/sync/storage';
import { toHandBody, toProgressBody } from '../../src/sync/records';
import type { HandRecord, ProgressSnapshot } from '../../src/sync/records';
import { PLAYER_A, fakeStore, invoke, type FakeStore } from '../helpers/api';

/**
 * T093 — FR-071: a retry after an ambiguous failure produces exactly one hand
 * log and no double-counted counter.
 *
 * The scenario worth being precise about is the *ambiguous* one: the write
 * reaches the database and the response is lost. The client cannot distinguish
 * that from a write that never landed, so it must retry — and the system has to
 * make that retry harmless. This test drives the real outbox against the real
 * handlers, with only the database faked, because idempotency that holds in the
 * handler but not through the queue would still lose the guarantee.
 */

let store: FakeStore;
let progress: ReturnType<typeof createProgressHandler>;
let hands: ReturnType<typeof createHandsHandler>;

const HAND: HandRecord = {
  handId: '11111111-1111-4111-8111-111111111111',
  playedAt: '2026-07-26T18:22:41.000Z',
  seed: 918273645,
  dealerUpcard: '10',
  actions: [{ handId: 'h1', action: 'hit' }],
  decisions: [],
  finalTotals: { player: [20], dealer: 19 },
  outcome: 'win',
  netChange: 10,
};

const SNAPSHOT: ProgressSnapshot = {
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
};

/**
 * A transport over the handlers. `dropResponses` reproduces the ambiguous
 * failure: the request is fully processed, then the reply is thrown away.
 */
function transport(options: { dropResponses?: boolean } = {}) {
  return {
    async sendHands(batch: readonly HandRecord[]): Promise<void> {
      const result = await invoke(hands, {
        method: 'POST',
        body: { player_id: PLAYER_A, hands: batch.map(toHandBody) },
      });
      if (options.dropResponses) throw new Error('network dropped the response');
      if (result.status >= 400) throw new Error(`status ${result.status}`);
    },
    async sendProgress(snapshot: ProgressSnapshot): Promise<void> {
      const result = await invoke(progress, {
        method: 'PUT',
        body: toProgressBody(PLAYER_A, snapshot),
      });
      if (options.dropResponses) throw new Error('network dropped the response');
      if (result.status >= 400) throw new Error(`status ${result.status}`);
    },
  };
}

beforeEach(() => {
  clearLocalState();
  clearOutbox();
  store = fakeStore();
  progress = createProgressHandler(store);
  hands = createHandsHandler(store);
});

describe('retry after an ambiguous failure (FR-071)', () => {
  it('FR-071: a hand written twice appears exactly once', async () => {
    enqueueHand(HAND);

    // The write lands; the response is lost, so the record stays queued.
    const first = await drainOutbox(transport({ dropResponses: true }));
    expect(first.failed).toBe(true);
    expect(pendingCount()).toBe(1);

    await drainOutbox(transport());

    expect(store.handRows.size).toBe(1);
    expect(pendingCount()).toBe(0);
  });

  it('FR-071: many retries of the same hand still leave one log', async () => {
    enqueueHand(HAND);
    for (let i = 0; i < 5; i += 1) await drainOutbox(transport({ dropResponses: true }));
    await drainOutbox(transport());
    expect(store.handRows.size).toBe(1);
  });

  it('FR-071: a retried progress write does not double-count a counter', async () => {
    enqueueProgress(SNAPSHOT);

    await drainOutbox(transport({ dropResponses: true }));
    await drainOutbox(transport());

    // Counters are absolute totals, so the second application is a no-op rather
    // than an increment. Sending deltas would make this test fail by design.
    expect(store.progressRows.get(PLAYER_A)).toMatchObject({
      xp: 60,
      hands_played: 5,
      decisions_taken: 7,
      decisions_matched: 5,
    });
  });

  it('FR-071: an older snapshot arriving after a newer one cannot roll counters back', async () => {
    enqueueProgress({ ...SNAPSHOT, xp: 200, handsPlayed: 15 });
    await drainOutbox(transport());

    enqueueProgress(SNAPSHOT);
    await drainOutbox(transport());

    expect(store.progressRows.get(PLAYER_A)).toMatchObject({ xp: 200, hands_played: 15 });
  });

  it('FR-062, FR-071: a hand and its progress both survive an outage and land once', async () => {
    enqueueHand(HAND);
    enqueueProgress(SNAPSHOT);

    await drainOutbox(transport({ dropResponses: true }));
    expect(pendingCount()).toBe(2);

    const result = await drainOutbox(transport());

    expect(result.failed).toBe(false);
    expect(store.handRows.size).toBe(1);
    expect(store.progressRows.get(PLAYER_A)).toMatchObject({ xp: 60 });
    expect(pendingCount()).toBe(0);
  });

  it('FR-062: play continues across the outage — later hands queue behind the stuck one', async () => {
    enqueueHand(HAND);
    await drainOutbox(transport({ dropResponses: true }));

    enqueueHand({ ...HAND, handId: '22222222-2222-4222-8222-222222222222' });
    enqueueHand({ ...HAND, handId: '33333333-3333-4333-8333-333333333333' });
    expect(pendingCount()).toBe(3);

    await drainOutbox(transport());

    expect(store.handRows.size).toBe(3);
    expect(pendingCount()).toBe(0);
  });
});
