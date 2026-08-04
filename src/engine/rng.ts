import type { Rng } from './types';

/**
 * T016 — the seeded PRNG (research.md R2).
 *
 * mulberry32: a 32-bit generator that is small, fast, and — the only property
 * that actually matters here — exactly reproducible. Statistical quality is
 * irrelevant to a play-money trainer; `createRng(n)` producing the same
 * sequence in every process on every platform is not.
 *
 * `Math.random` appears nowhere in this directory. The lint rule in
 * eslint.config.js makes that a build failure rather than a review note.
 */
export function createRng(seed: number): Rng {
  // Fold any input — negative, fractional, or beyond 2^32 — into a 32-bit
  // integer, so a seed derived from a timestamp or a hand id is still valid.
  let state = Math.trunc(seed) | 0;

  return {
    next(): number {
      state = (state + 0x6d2b79f5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

/**
 * Draws an integer in [0, bound). Used by the Fisher–Yates shuffle so the
 * modulo bias discussion stays in one place rather than at every call site.
 */
export function nextInt(rng: Rng, bound: number): number {
  if (bound <= 0) return 0;
  return Math.floor(rng.next() * bound);
}
