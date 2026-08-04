import type { Rng } from '../../src/engine/types';

/**
 * T017 — an `Rng` that returns a sequence you choose.
 *
 * Seed-hunting is the enemy of a readable engine test. Wanting "player is dealt
 * two Aces" should not mean searching for a seed that happens to produce it, so
 * these helpers let a test state the randomness it wants directly.
 *
 * For forcing *specific cards* prefer `stackedShoe` in ./hands — controlling the
 * shuffle through raw floats is possible but says nothing about intent.
 */
export function scriptedRng(values: readonly number[]): Rng {
  let index = 0;
  return {
    next(): number {
      const value = values[index];
      if (value === undefined) {
        throw new Error(
          `scriptedRng exhausted after ${values.length} value(s). ` +
            `The code under test drew more randomness than the script provides.`,
        );
      }
      index += 1;
      return value;
    },
  };
}

/** An `Rng` that always returns the same value. Useful for degenerate shuffles. */
export function constantRng(value: number): Rng {
  return { next: () => value };
}

/**
 * An `Rng` that records every draw, so a test can assert *how much* randomness
 * a function consumed — the cheapest way to catch an accidental extra draw that
 * would silently desynchronise a replay.
 */
export function recordingRng(inner: Rng): Rng & { readonly draws: readonly number[] } {
  const draws: number[] = [];
  return {
    draws,
    next(): number {
      const value = inner.next();
      draws.push(value);
      return value;
    },
  };
}
