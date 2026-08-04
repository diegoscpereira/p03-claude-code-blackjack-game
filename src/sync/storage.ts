/**
 * Local storage that cannot bring down a hand.
 *
 * Constitution, Additional Constraints — Data: *"Reads of stored state MUST
 * tolerate absence, corruption, or a schema from a previous version without
 * crashing or blocking play."* That is a strong requirement, and it is the
 * reason every local read in this app goes through here rather than calling
 * `JSON.parse(localStorage.getItem(...))` at the call site.
 *
 * Two failure modes are handled that are easy to forget:
 *   - `localStorage` may throw on *access*, not just on write — Safari private
 *     mode and some embedded webviews do exactly that.
 *   - The engine test suite runs in Node with no DOM at all, so this degrades
 *     to memory rather than assuming a browser.
 */

/** The schema version stamped on every record this app writes. */
export const SCHEMA_VERSION = 1;

const memory = new Map<string, string>();

function backing(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  try {
    if (typeof globalThis.localStorage !== 'undefined') return globalThis.localStorage;
  } catch {
    // Access itself threw — fall through to the in-memory map.
  }
  return {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => void memory.set(key, value),
    removeItem: (key) => void memory.delete(key),
  };
}

/** Raw read. Returns null when absent or unreadable. */
export function rawRead(key: string): string | null {
  try {
    return backing().getItem(key);
  } catch {
    return null;
  }
}

/** Raw write. Silently gives up rather than interrupting play (FR-062). */
export function rawWrite(key: string, value: string): void {
  try {
    backing().setItem(key, value);
  } catch {
    // Quota exceeded, or storage disabled. Local state stays authoritative in
    // memory; the only cost is that it will not survive a reload.
  }
}

export function rawRemove(key: string): void {
  try {
    backing().removeItem(key);
  } catch {
    // Nothing useful to do, and nothing that should reach the player.
  }
}

/**
 * Reads a versioned JSON record, returning `fallback` for anything it does not
 * fully recognise: absent, unparseable, wrong shape, or a schema version this
 * build does not know.
 *
 * Discarding an unknown version is deliberate. Half-trusting a record written
 * by a future build is how a "resilient" reader turns one bad write into a
 * persistent, confusing state.
 */
export function readRecord<T>(key: string, fallback: T, parse: (value: unknown) => T | null): T {
  const raw = rawRead(key);
  if (raw === null) return fallback;

  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    return fallback;
  }

  if (typeof decoded !== 'object' || decoded === null || Array.isArray(decoded)) return fallback;

  const version = (decoded as { version?: unknown }).version;
  if (version !== undefined && version !== SCHEMA_VERSION) return fallback;

  return parse(decoded) ?? fallback;
}

export function writeRecord(key: string, value: object): void {
  rawWrite(key, JSON.stringify({ ...value, version: SCHEMA_VERSION }));
}

/** Test seam: drops every key this app owns, in memory and in the browser. */
export function clearLocalState(): void {
  memory.clear();
  for (const key of ['bj.tutorial', 'bj.player_id', 'bj.outbox']) rawRemove(key);
}
