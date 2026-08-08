import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BACKOFF_BASE_MS,
  BACKOFF_MAX_MS,
  OUTBOX_CAP,
  OUTBOX_KEY,
  backoffDelay,
  clearOutbox,
  drainOutbox,
  enqueueHand,
  enqueueProgress,
  pendingCount,
  readOutbox,
} from '../../../src/sync/outbox';
import { clearLocalState, rawRead } from '../../../src/sync/storage';
import type { HandRecord, ProgressSnapshot } from '../../../src/sync/records';

/**
 * T092 — FR-061, FR-062, research.md R5: the durable outbox.
 *
 * The three properties that matter, and that this file exists to pin down:
 * enqueue is synchronous (it runs on the settlement path and may not await),
 * the queue survives a reload, and it is bounded. An unbounded queue would
 * violate the constitution's bounded-memory rule, not merely be untidy.
 */

const HAND: HandRecord = {
  handId: '11111111-1111-4111-8111-111111111111',
  playedAt: '2026-07-26T18:22:41.000Z',
  seed: 918273645,
  dealerUpcard: '10',
  actions: [{ handId: 'h1', action: 'hit' }],
  decisions: [
    {
      handId: 'h1',
      playerTotal: 16,
      isSoft: false,
      dealerUpcard: '10',
      chosen: 'hit',
      recommended: 'hit',
      matched: true,
    },
  ],
  finalTotals: { player: [21], dealer: 19 },
  outcome: 'win',
  netChange: 10,
};

const PROGRESS: ProgressSnapshot = {
  level: 4,
  xp: 224,
  handsPlayed: 37,
  wins: 18,
  losses: 16,
  pushes: 3,
  netBankrollChange: -45,
  bankroll: 955,
  decisionsTaken: 64,
  decisionsMatched: 51,
  unlocks: ['post_game_analysis'],
  bankrollResets: 0,
};

const handWithId = (id: string): HandRecord => ({ ...HAND, handId: id });

beforeEach(() => {
  clearLocalState();
});

describe('enqueue (FR-061)', () => {
  it('FR-061: enqueue is synchronous — it returns a value, not a promise', () => {
    const returned: unknown = enqueueHand(HAND);
    expect(returned).toBeUndefined();
    expect(pendingCount()).toBe(1);
  });

  it('FR-061: a queued hand round-trips intact', () => {
    enqueueHand(HAND);
    expect(readOutbox().hands).toEqual([HAND]);
  });

  it('FR-061: hands queue in the order they settled', () => {
    enqueueHand(handWithId('a'));
    enqueueHand(handWithId('b'));
    enqueueHand(handWithId('c'));
    expect(readOutbox().hands.map((hand) => hand.handId)).toEqual(['a', 'b', 'c']);
  });

  it('FR-071: the same hand enqueued twice is queued once', () => {
    enqueueHand(HAND);
    enqueueHand(HAND);
    // `hand_id` is the idempotency key end to end, so deduplicating here saves a
    // round trip that the endpoint would have discarded anyway.
    expect(readOutbox().hands).toHaveLength(1);
  });

  it('R4: only the latest progress snapshot is retained', () => {
    enqueueProgress(PROGRESS);
    enqueueProgress({ ...PROGRESS, xp: 300 });
    // Counters are absolute totals, never deltas — so an older snapshot carries
    // no information the newer one lacks, and keeping it would only cost a write.
    expect(readOutbox().progress).toMatchObject({ xp: 300 });
    expect(pendingCount()).toBe(1);
  });

  it('FR-063: pending count covers both queued hands and pending progress', () => {
    expect(pendingCount()).toBe(0);
    enqueueHand(HAND);
    enqueueProgress(PROGRESS);
    expect(pendingCount()).toBe(2);
  });
});

describe('durability (FR-062)', () => {
  it('FR-062: the queue survives a simulated reload', () => {
    enqueueHand(HAND);
    enqueueProgress(PROGRESS);
    // A reload keeps localStorage and drops every module-level variable. Reading
    // straight back from the raw key is how we prove nothing is cached in memory.
    expect(rawRead(OUTBOX_KEY)).not.toBeNull();
    expect(readOutbox().hands).toHaveLength(1);
    expect(readOutbox().progress).not.toBeNull();
  });

  it('FR-062: clearing the outbox empties it', () => {
    enqueueHand(HAND);
    clearOutbox();
    expect(pendingCount()).toBe(0);
  });
});

describe('the cap (research.md R5, bounded memory)', () => {
  it('R5: retains at most 500 hands', () => {
    for (let i = 0; i < OUTBOX_CAP + 25; i += 1) enqueueHand(handWithId(`h${i}`));
    expect(readOutbox().hands).toHaveLength(OUTBOX_CAP);
  });

  it('R5: drops the oldest records, keeping the newest', () => {
    for (let i = 0; i < OUTBOX_CAP + 3; i += 1) enqueueHand(handWithId(`h${i}`));
    const ids = readOutbox().hands.map((hand) => hand.handId);
    expect(ids[0]).toBe('h3');
    expect(ids.at(-1)).toBe(`h${OUTBOX_CAP + 2}`);
  });

  it('R5: counts what it dropped rather than discarding silently', () => {
    for (let i = 0; i < OUTBOX_CAP + 7; i += 1) enqueueHand(handWithId(`h${i}`));
    expect(readOutbox().dropped).toBe(7);
  });

  it('R5: the cap is exactly 500', () => {
    expect(OUTBOX_CAP).toBe(500);
  });
});

describe('backoff (FR-062)', () => {
  it('FR-062: grows exponentially with the attempt count', () => {
    const noJitter = () => 1;
    expect(backoffDelay(0, noJitter)).toBe(BACKOFF_BASE_MS);
    expect(backoffDelay(1, noJitter)).toBe(BACKOFF_BASE_MS * 2);
    expect(backoffDelay(2, noJitter)).toBe(BACKOFF_BASE_MS * 4);
  });

  it('FR-062: is capped so a long outage cannot schedule a retry hours away', () => {
    expect(backoffDelay(50, () => 1)).toBe(BACKOFF_MAX_MS);
  });

  it('FR-062: applies jitter, so many clients do not retry in lockstep', () => {
    expect(backoffDelay(3, () => 0)).toBeLessThan(backoffDelay(3, () => 1));
  });

  it('FR-062: never returns a negative or non-finite delay', () => {
    for (const attempt of [-5, 0, 1, 9, 100]) {
      const delay = backoffDelay(attempt, () => 0);
      expect(Number.isFinite(delay)).toBe(true);
      expect(delay).toBeGreaterThanOrEqual(0);
    }
  });

  it('FR-062: never shrinks as attempts accumulate', () => {
    const noJitter = () => 1;
    let previous = 0;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const delay = backoffDelay(attempt, noJitter);
      expect(delay).toBeGreaterThanOrEqual(previous);
      previous = delay;
    }
  });
});

describe('draining (FR-062, FR-064)', () => {
  const transport = () => ({
    sendHands: vi.fn().mockResolvedValue(undefined),
    sendProgress: vi.fn().mockResolvedValue(undefined),
  });

  it('FR-064: sends queued records and empties the queue on success', async () => {
    enqueueHand(HAND);
    enqueueProgress(PROGRESS);
    const sink = transport();

    const result = await drainOutbox(sink);

    expect(sink.sendHands).toHaveBeenCalledWith([HAND]);
    expect(sink.sendProgress).toHaveBeenCalledWith(PROGRESS);
    expect(result).toMatchObject({ handsSent: 1, progressSent: true, failed: false });
    expect(pendingCount()).toBe(0);
  });

  it('FR-062: keeps the records queued when the send fails', async () => {
    enqueueHand(HAND);
    const sink = transport();
    sink.sendHands.mockRejectedValue(new Error('offline'));

    const result = await drainOutbox(sink);

    expect(result.failed).toBe(true);
    expect(pendingCount()).toBe(1);
  });

  it('FR-062: a failed drain raises the attempt count for the next backoff', async () => {
    enqueueHand(HAND);
    const sink = transport();
    sink.sendHands.mockRejectedValue(new Error('offline'));

    await drainOutbox(sink);
    expect(readOutbox().attempts).toBe(1);
    await drainOutbox(sink);
    expect(readOutbox().attempts).toBe(2);
  });

  it('FR-062: a successful drain resets the attempt count', async () => {
    enqueueHand(HAND);
    const failing = transport();
    failing.sendHands.mockRejectedValue(new Error('offline'));
    await drainOutbox(failing);

    await drainOutbox(transport());
    expect(readOutbox().attempts).toBe(0);
  });

  it('FR-070: batches at 50 hands per request', async () => {
    for (let i = 0; i < 120; i += 1) enqueueHand(handWithId(`h${i}`));
    const sink = transport();

    await drainOutbox(sink);

    expect(sink.sendHands).toHaveBeenCalledTimes(3);
    for (const [batch] of sink.sendHands.mock.calls) {
      expect((batch as readonly HandRecord[]).length).toBeLessThanOrEqual(50);
    }
    expect(pendingCount()).toBe(0);
  });

  it('FR-062: a batch that fails mid-drain leaves the unsent records queued', async () => {
    for (let i = 0; i < 120; i += 1) enqueueHand(handWithId(`h${i}`));
    const sink = transport();
    sink.sendHands.mockResolvedValueOnce(undefined).mockRejectedValue(new Error('offline'));

    const result = await drainOutbox(sink);

    expect(result.failed).toBe(true);
    // The first 50 landed and must not be re-sent; the remaining 70 stay queued.
    expect(readOutbox().hands).toHaveLength(70);
    expect(readOutbox().hands[0]?.handId).toBe('h50');
  });

  it('FR-061: draining an empty queue is a no-op that touches no transport', async () => {
    const sink = transport();
    const result = await drainOutbox(sink);
    expect(sink.sendHands).not.toHaveBeenCalled();
    expect(sink.sendProgress).not.toHaveBeenCalled();
    expect(result).toMatchObject({ handsSent: 0, progressSent: false, failed: false });
  });

  it('FR-062: a hand enqueued during a drain is not lost', async () => {
    enqueueHand(handWithId('first'));
    const sink = transport();
    sink.sendHands.mockImplementation(async () => {
      // Settlement does not pause for a background drain, so this is the real
      // interleaving rather than a contrived one.
      enqueueHand(handWithId('during'));
    });

    await drainOutbox(sink);

    expect(readOutbox().hands.map((hand) => hand.handId)).toEqual(['during']);
  });
});
