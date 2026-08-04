/**
 * Where a round's seed comes from.
 *
 * Normally random — but `?seed=N` pins it, so a hand can be reproduced in a
 * real browser from a URL alone. That is not a test backdoor: it is the
 * browser-facing half of the reproducibility User Story 7 promises a reviewer,
 * and it is what makes the end-to-end determinism check honest rather than
 * mocked.
 *
 * Successive rounds take successive seeds, so a whole *session* replays, not
 * just its first hand.
 */
export function createSeedSource(search: string): () => number {
  const fixed = new URLSearchParams(search).get('seed');
  const parsed = fixed === null ? Number.NaN : Number(fixed);

  if (Number.isFinite(parsed)) {
    let next = Math.trunc(parsed);
    return () => next++;
  }

  return () => Math.floor(Math.random() * 2 ** 31);
}

/** The source for this session. Resolved once, at module load. */
export const nextSeed: () => number = createSeedSource(
  typeof window === 'undefined' ? '' : window.location.search,
);
