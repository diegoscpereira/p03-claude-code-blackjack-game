import { beforeEach, describe, expect, it } from 'vitest';
import { OUTBOX_KEY, enqueueHand, pendingCount, readOutbox } from '../../../src/sync/outbox';
import { PLAYER_ID_KEY, getPlayerId, readPlayerId } from '../../../src/sync/identity';
import { TUTORIAL_KEY, readTutorialState } from '../../../src/ui/tutorial/tutorialState';
import { clearLocalState, rawWrite } from '../../../src/sync/storage';
import type { HandRecord } from '../../../src/sync/records';

/**
 * T092a — constitution, Additional Constraints (Data): *"Reads of stored state
 * MUST tolerate absence, corruption, or a schema from a previous version
 * without crashing or blocking play."*
 *
 * Every local key gets the same three insults: malformed JSON, a truncated
 * write, and a schema version this build has never seen. The bar is not that
 * the data survives — it is that the *player* does. A discarded record costs
 * one session's queued syncs; a thrown exception at module load costs the game.
 */

const HAND: HandRecord = {
  handId: '11111111-1111-4111-8111-111111111111',
  playedAt: '2026-07-26T18:22:41.000Z',
  seed: 1,
  dealerUpcard: '10',
  actions: [],
  decisions: [],
  finalTotals: { player: [20], dealer: 19 },
  outcome: 'win',
  netChange: 10,
};

const CORRUPTIONS: readonly [string, string][] = [
  ['malformed JSON', '{not json at all'],
  ['a truncated write', '{"hands":[{"handId":"a"'],
  ['an unknown schema version', '{"version":99,"hands":[{"handId":"a"}]}'],
  ['JSON of the wrong shape', '["hands"]'],
  ['a bare primitive', '42'],
  ['an empty string', ''],
];

beforeEach(() => {
  clearLocalState();
});

describe('bj.outbox resilience (constitution: Data)', () => {
  it.each(CORRUPTIONS)('discards %s and starts from an empty queue', (_label, corrupt) => {
    rawWrite(OUTBOX_KEY, corrupt);
    expect(() => readOutbox()).not.toThrow();
    expect(readOutbox().hands).toEqual([]);
    expect(readOutbox().progress).toBeNull();
    expect(pendingCount()).toBe(0);
  });

  it('recovers by overwriting corrupt state on the next enqueue', () => {
    rawWrite(OUTBOX_KEY, 'garbage');
    enqueueHand(HAND);
    expect(readOutbox().hands).toHaveLength(1);
  });

  it('drops individual queue entries that are not well-formed hand records', () => {
    rawWrite(OUTBOX_KEY, '{"hands":[{"handId":"ok","seed":1},null,7,"x"],"progress":null}');
    // A partially valid queue keeps what it can rather than discarding the lot —
    // queued results are the player's, and throwing them away is the worse loss.
    expect(() => readOutbox()).not.toThrow();
    expect(readOutbox().hands.every((hand) => typeof hand.handId === 'string')).toBe(true);
  });

  it('tolerates a non-numeric dropped counter', () => {
    rawWrite(OUTBOX_KEY, '{"hands":[],"progress":null,"dropped":"lots","attempts":"many"}');
    expect(readOutbox().dropped).toBe(0);
    expect(readOutbox().attempts).toBe(0);
  });
});

describe('bj.player_id resilience (FR-053, FR-066)', () => {
  it.each(CORRUPTIONS)('replaces %s with a freshly generated identity', (_label, corrupt) => {
    rawWrite(PLAYER_ID_KEY, corrupt);
    expect(() => getPlayerId()).not.toThrow();
    const id = getPlayerId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('FR-053: rejects a stored value that is not a UUID', () => {
    rawWrite(PLAYER_ID_KEY, '"not-a-uuid"');
    expect(readPlayerId()).toBeNull();
  });

  it('FR-066: creates an identity on first visit and reuses it afterwards', () => {
    expect(readPlayerId()).toBeNull();
    const first = getPlayerId();
    expect(getPlayerId()).toBe(first);
    expect(readPlayerId()).toBe(first);
  });

  it('FR-053: a replaced identity persists, so it is generated once and not per call', () => {
    rawWrite(PLAYER_ID_KEY, 'garbage');
    const replacement = getPlayerId();
    expect(getPlayerId()).toBe(replacement);
  });
});

describe('bj.tutorial resilience (constitution: Data)', () => {
  it.each(CORRUPTIONS)('discards %s and falls back to defaults', (_label, corrupt) => {
    rawWrite(TUTORIAL_KEY, corrupt);
    expect(() => readTutorialState()).not.toThrow();
    expect(readTutorialState()).toEqual({ dismissed: false, completed: false, lastStep: 0 });
  });
});

describe('the app still reaches a playable table (constitution: Data)', () => {
  it('every local key corrupt at once still yields usable state', async () => {
    rawWrite(OUTBOX_KEY, '{{{');
    rawWrite(PLAYER_ID_KEY, '{{{');
    rawWrite(TUTORIAL_KEY, '{{{');

    // Importing the store is what a reload does. If a corrupt key could throw
    // during module initialisation, the table would never render at all.
    const { useGameStore } = await import('../../../src/store/gameStore');
    const store = useGameStore.getState();
    store.reset();

    expect(() => store.deal(12345)).not.toThrow();
    expect(useGameStore.getState().round).not.toBeNull();
  });
});
