import { backoffDelay, drainOutbox, pendingCount, readOutbox } from './outbox';
import type { OutboxTransport } from './outbox';
import { fromProgressBody, toHandBody, toProgressBody } from './records';
import type { HandRecord, ProgressSnapshot } from './records';

/**
 * T102 — the only code in the client that touches the network.
 *
 * Every path here is background. Nothing on an interactive path calls into this
 * module, which is what makes NFR-007's offline guarantee structural rather
 * than a promise: there is no gameplay code that *could* await a fetch.
 *
 * Requests are built from a fixed base path, so the client cannot be pointed at
 * a database host even by accident (FR-068). It holds no credential — the
 * service key exists only in Vercel's server-side environment configuration.
 */

const API_BASE = '/api';

/** Long enough for a cold serverless start (R3), short enough to retry today. */
const REQUEST_TIMEOUT_MS = 10_000;

/** How often an idle client checks for anything to send. */
const DRAIN_INTERVAL_MS = 15_000;

async function request(path: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(`${API_BASE}${path}`, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

/**
 * FR-064 — the session-start read.
 *
 * A 404 resolves to `null` rather than throwing, because a player with no
 * stored row is the ordinary first-visit case (FR-066), not a failure. A real
 * failure throws, and the caller keeps playing from local state either way.
 */
export async function fetchProgress(playerId: string): Promise<ProgressSnapshot | null> {
  const response = await request(`/progress?player_id=${encodeURIComponent(playerId)}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`progress read failed: ${response.status}`);
  return fromProgressBody(await response.json());
}

/** The transport the outbox drains through. */
export function apiTransport(playerId: string): OutboxTransport {
  return {
    async sendHands(hands: readonly HandRecord[]): Promise<void> {
      const response = await request(
        '/hands',
        jsonInit('POST', { player_id: playerId, hands: hands.map(toHandBody) }),
      );
      if (!response.ok) throw new Error(`hand write failed: ${response.status}`);
    },

    async sendProgress(snapshot: ProgressSnapshot): Promise<void> {
      const response = await request(
        '/progress',
        jsonInit('PUT', toProgressBody(playerId, snapshot)),
      );
      if (!response.ok) throw new Error(`progress write failed: ${response.status}`);
    },
  };
}

/**
 * Drains in the background, forever, without ever surfacing a failure.
 *
 * The schedule has two inputs: a steady interval, and the `online` event —
 * which is the one that matters, because it turns "reconnected" into "synced"
 * in about a second rather than at the next tick. After a failure the delay
 * follows the outbox's own attempt count, so a device that has been offline all
 * night is not hammering a dead endpoint every fifteen seconds.
 *
 * Returns a teardown function; it is used by the store and by tests, and its
 * absence in a component would be a leak rather than a bug you would notice.
 */
export function startOutboxDrain(playerId: string, onChange: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  let running = false;

  const schedule = (delay: number): void => {
    if (stopped) return;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => void tick(), delay);
  };

  const tick = async (): Promise<void> => {
    if (stopped || running) return;
    running = true;
    try {
      if (pendingCount() > 0) {
        const result = await drainOutbox(apiTransport(playerId));
        onChange();
        if (result.failed) return schedule(backoffDelay(readOutbox().attempts));
      }
      schedule(DRAIN_INTERVAL_MS);
    } catch {
      // A drain never throws through to the caller — FR-062 makes failure a
      // passive indicator, and an unhandled rejection here would be neither
      // passive nor informative.
      schedule(backoffDelay(readOutbox().attempts));
    } finally {
      running = false;
    }
  };

  const onOnline = (): void => schedule(0);
  if (typeof window !== 'undefined') window.addEventListener('online', onOnline);
  schedule(0);

  return () => {
    stopped = true;
    if (timer !== null) clearTimeout(timer);
    if (typeof window !== 'undefined') window.removeEventListener('online', onOnline);
  };
}
