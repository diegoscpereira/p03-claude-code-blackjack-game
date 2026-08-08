import { rawRead, rawWrite } from './storage';

/**
 * T100 — FR-053, FR-066: device-scoped identity.
 *
 * A UUID generated on the client, stored under `bj.player_id`, and never
 * accompanied by anything that identifies a person (FR-054). There is no
 * sign-up step because there is no account — the accepted cost is that clearing
 * site data loses progression, which docs/adr/0004 records as a decision rather
 * than an oversight.
 *
 * Stored raw rather than through `writeRecord`, because a bare UUID has no
 * schema to version and wrapping it would only add a way for it to be corrupt.
 */

export const PLAYER_ID_KEY = 'bj.player_id';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The stored identity, or `null` when absent or not a UUID. */
export function readPlayerId(): string | null {
  const stored = rawRead(PLAYER_ID_KEY);
  if (stored === null) return null;
  // Anything that is not a UUID is treated as absent rather than repaired: a
  // half-trusted identifier would scope every future write to a row nobody owns.
  return UUID_PATTERN.test(stored.trim()) ? stored.trim() : null;
}

/** FR-066: returns the stored identity, creating one on a first visit. */
export function getPlayerId(): string {
  const existing = readPlayerId();
  if (existing !== null) return existing;

  const created = generateUuid();
  rawWrite(PLAYER_ID_KEY, created);
  return created;
}

/**
 * `crypto.randomUUID` where it exists, and a v4-shaped fallback where it does
 * not — it is absent over plain HTTP in some browsers, which is exactly the
 * local-development case. Uniqueness here scopes one device's own rows; it is
 * not a security boundary, so `Math.random` is adequate for the fallback.
 */
export function generateUuid(): string {
  const webCrypto = globalThis.crypto;
  if (typeof webCrypto?.randomUUID === 'function') return webCrypto.randomUUID();

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}
