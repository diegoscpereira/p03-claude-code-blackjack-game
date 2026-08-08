/**
 * The minimal request/response shape the handlers need.
 *
 * Vercel passes Node-style `req`/`res` objects with a few conveniences. Rather
 * than depend on `@vercel/node` for two handlers — the constitution asks for
 * each runtime dependency to be justified — this declares the structural subset
 * actually used. The practical benefit is that `tests/helpers/api.ts` can drive
 * the real handlers with a plain object and no platform shim.
 *
 * Files under `api/_lib/` are ignored by Vercel's function discovery, so this
 * is shared code rather than a third endpoint.
 */

export interface ApiRequest {
  readonly method?: string;
  readonly query: Record<string, string | string[] | undefined>;
  readonly body: unknown;
}

export interface ApiResponse {
  status(code: number): ApiResponse;
  json(body: unknown): void;
}

export type ApiHandler = (req: ApiRequest, res: ApiResponse) => Promise<void>;

/** Errors are `{ error }` with a status the client can act on (http-api.md). */
export function fail(res: ApiResponse, status: number, message: string): void {
  res.status(status).json({ error: message });
}

/**
 * FR-069: the identifier is the only scope there is, so reading it is the one
 * place a mistake would be unrecoverable.
 *
 * A repeated `?player_id=a&player_id=b` arrives as an array. Picking either one
 * would be a scoping decision made by accident, so it is rejected — the client
 * never sends that, and anything that does is not a client we should serve.
 */
export function readPlayerId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return UUID_PATTERN.test(trimmed) ? trimmed : null;
}

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
