import { readRecord, writeRecord } from './storage';
import type { HandRecord, ProgressSnapshot } from './records';

/**
 * T101 — the durable outbox (FR-061, FR-062, research.md R5).
 *
 * Three properties, in the order they matter:
 *
 * 1. **Enqueue is synchronous.** It runs on the settlement path, which may not
 *    await anything (NFR-001). That single constraint is why this is backed by
 *    `localStorage` rather than IndexedDB.
 * 2. **The queue survives a tab close** (FR-062), so a hand played on a train
 *    is still there tomorrow.
 * 3. **It is bounded.** 500 hands, oldest dropped, drops counted. Constitution
 *    Principle IV requires bounded memory across arbitrarily long sessions, and
 *    an unbounded queue on a device that never reconnects would violate it.
 *
 * Draining is deliberately not scheduled here — `startOutboxDrain` in
 * `client.ts` owns the timer, so this module stays a pure-ish data structure
 * that tests can drive one call at a time.
 */

export const OUTBOX_KEY = 'bj.outbox';

/** research.md R5. Beyond this, the oldest hands are dropped and counted. */
export const OUTBOX_CAP = 500;

/** contracts/http-api.md: 50 hands per request. */
export const BATCH_SIZE = 50;

export const BACKOFF_BASE_MS = 1000;
export const BACKOFF_MAX_MS = 60_000;

export interface OutboxState {
  readonly hands: readonly HandRecord[];
  /** Only the latest matters — counters are absolute totals, never deltas (R4). */
  readonly progress: ProgressSnapshot | null;
  readonly dropped: number;
  /** Consecutive failed drains, for the next backoff (FR-062). */
  readonly attempts: number;
}

const EMPTY: OutboxState = { hands: [], progress: null, dropped: 0, attempts: 0 };

// ---- reading and writing ---------------------------------------------------

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const counter = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.trunc(value) : 0;

/**
 * A queued hand is kept only if every field the endpoint requires is present.
 * Entries that fail are dropped individually rather than condemning the whole
 * queue — the records are the player's, and discarding the lot is the worse loss.
 */
function isHandRecord(value: unknown): value is HandRecord {
  if (!isRecord(value)) return false;
  return (
    typeof value.handId === 'string' &&
    value.handId.length > 0 &&
    typeof value.playedAt === 'string' &&
    typeof value.seed === 'number' &&
    typeof value.dealerUpcard === 'string' &&
    typeof value.outcome === 'string' &&
    typeof value.netChange === 'number' &&
    Array.isArray(value.actions) &&
    Array.isArray(value.decisions) &&
    isRecord(value.finalTotals)
  );
}

function isProgressSnapshot(value: unknown): value is ProgressSnapshot {
  return isRecord(value) && typeof value.xp === 'number' && typeof value.level === 'number';
}

function parse(value: unknown): OutboxState {
  if (!isRecord(value)) return EMPTY;
  const hands = Array.isArray(value.hands) ? value.hands.filter(isHandRecord) : [];

  return {
    hands,
    progress: isProgressSnapshot(value.progress) ? value.progress : null,
    dropped: counter(value.dropped),
    attempts: counter(value.attempts),
  };
}

/** Always safe to call: any unreadable state degrades to an empty queue. */
export function readOutbox(): OutboxState {
  return readRecord(OUTBOX_KEY, EMPTY, parse);
}

function write(state: OutboxState): void {
  writeRecord(OUTBOX_KEY, state);
}

export function clearOutbox(): void {
  write(EMPTY);
}

/** FR-063: what the sync indicator counts. */
export function pendingCount(): number {
  const state = readOutbox();
  return state.hands.length + (state.progress === null ? 0 : 1);
}

// ---- enqueueing ------------------------------------------------------------

/**
 * FR-061 — synchronous by contract. Returns nothing and awaits nothing, so the
 * settlement path cannot accidentally start depending on a network round trip.
 */
export function enqueueHand(record: HandRecord): void {
  const state = readOutbox();
  // `hand_id` is the idempotency key end to end; deduplicating here saves a
  // round trip the endpoint would have discarded anyway (FR-071).
  if (state.hands.some((hand) => hand.handId === record.handId)) return;

  const appended = [...state.hands, record];
  const overflow = Math.max(0, appended.length - OUTBOX_CAP);

  write({
    ...state,
    hands: appended.slice(overflow),
    dropped: state.dropped + overflow,
  });
}

/** R4: the newest snapshot supersedes the last, which carried no extra history. */
export function enqueueProgress(snapshot: ProgressSnapshot): void {
  write({ ...readOutbox(), progress: snapshot });
}

// ---- draining --------------------------------------------------------------

export interface OutboxTransport {
  sendHands(hands: readonly HandRecord[]): Promise<void>;
  sendProgress(snapshot: ProgressSnapshot): Promise<void>;
}

export interface DrainResult {
  readonly handsSent: number;
  readonly progressSent: boolean;
  readonly failed: boolean;
}

/**
 * FR-062: exponential backoff with jitter, capped.
 *
 * The jitter matters less here than in a fleet — one player is not a thundering
 * herd — but the cap does: without it, a device left offline overnight would
 * schedule its next attempt hours out and miss the morning's reconnection
 * entirely.
 */
export function backoffDelay(attempt: number, random: () => number = Math.random): number {
  const steps = Math.max(0, Math.trunc(attempt));
  const exponential = Math.min(BACKOFF_BASE_MS * 2 ** Math.min(steps, 30), BACKOFF_MAX_MS);
  // Equal jitter: half the delay is fixed, half is random, so a retry never
  // fires immediately and never waits longer than the cap.
  return Math.round(exponential / 2 + (exponential / 2) * random());
}

/**
 * Sends everything queued, in batches, and removes only what was acknowledged.
 *
 * Removal re-reads the queue rather than writing back a snapshot taken at the
 * start: a hand can settle *during* a drain, and overwriting would silently
 * discard it. That interleaving is the normal case, not an edge case — nothing
 * pauses play while a background send is in flight.
 */
export async function drainOutbox(transport: OutboxTransport): Promise<DrainResult> {
  const start = readOutbox();
  if (start.hands.length === 0 && start.progress === null) {
    return { handsSent: 0, progressSent: false, failed: false };
  }

  let handsSent = 0;

  for (let i = 0; i < start.hands.length; i += BATCH_SIZE) {
    const batch = start.hands.slice(i, i + BATCH_SIZE);
    try {
      await transport.sendHands(batch);
    } catch {
      // FR-062: keep what was not acknowledged, retry later, tell nobody.
      return failed(handsSent);
    }
    removeHands(batch);
    handsSent += batch.length;
  }

  if (start.progress !== null) {
    try {
      await transport.sendProgress(start.progress);
    } catch {
      return failed(handsSent);
    }
    removeProgress(start.progress);
  }

  write({ ...readOutbox(), attempts: 0 });
  return { handsSent, progressSent: start.progress !== null, failed: false };
}

function failed(handsSent: number): DrainResult {
  const current = readOutbox();
  write({ ...current, attempts: current.attempts + 1 });
  return { handsSent, progressSent: false, failed: true };
}

function removeHands(sent: readonly HandRecord[]): void {
  const acknowledged = new Set(sent.map((hand) => hand.handId));
  const current = readOutbox();
  write({ ...current, hands: current.hands.filter((hand) => !acknowledged.has(hand.handId)) });
}

/**
 * Clears the pending snapshot only if it is still the one that was sent. A hand
 * settling mid-drain replaces it with a newer total, and dropping that would
 * lose the most recent progression until the next hand.
 */
function removeProgress(sent: ProgressSnapshot): void {
  const current = readOutbox();
  if (JSON.stringify(current.progress) !== JSON.stringify(sent)) return;
  write({ ...current, progress: null });
}
