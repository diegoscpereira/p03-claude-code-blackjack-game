import { describe, expect, it } from 'vitest';
import { createRng } from '../../../src/engine/rng';

/**
 * T015 — FR-004, SC-008.
 *
 * The guarantee under test: `createRng(n)` and `createRng(n)` produce identical
 * sequences, in any process, on any platform, forever. If this is not true,
 * nothing downstream is reproducible — no replay, no seeded test, no SC-008.
 *
 * The golden vectors below come from the published mulberry32 reference
 * (research.md R2), not from this repository's implementation. That is what
 * makes them an oracle: a rewrite of `rng.ts` that changes the sequence fails
 * here, which is exactly the regression "across process runs" is meant to catch.
 */
const GOLDEN: Record<number, number[]> = {
  42: [
    0.6011037519201636, 0.44829055899754167, 0.8524657934904099, 0.6697340414393693,
    0.17481389874592423,
  ],
  12345: [
    0.9797282677609473, 0.3067522644996643, 0.484205421525985, 0.817934412509203,
    0.5094283693470061,
  ],
  1: [
    0.6270739405881613, 0.002735721180215478, 0.5274470399599522, 0.9810509674716741,
    0.9683778982143849,
  ],
};

const take = (n: number, seed: number): number[] => {
  const rng = createRng(seed);
  return Array.from({ length: n }, () => rng.next());
};

describe('createRng (FR-004, SC-008)', () => {
  it('FR-004: produces the identical sequence for identical seeds', () => {
    expect(take(50, 42)).toEqual(take(50, 42));
    expect(take(50, 987654321)).toEqual(take(50, 987654321));
  });

  it('SC-008: reproduces a fixed sequence across process runs', () => {
    for (const [seed, expected] of Object.entries(GOLDEN)) {
      expect(take(expected.length, Number(seed))).toEqual(expected);
    }
  });

  it('FR-004: independent instances of the same seed stay in lockstep', () => {
    const a = createRng(7);
    const b = createRng(7);
    for (let i = 0; i < 100; i++) {
      expect(a.next()).toBe(b.next());
    }
  });

  it('FR-004: different seeds produce different sequences', () => {
    expect(take(20, 1)).not.toEqual(take(20, 2));
  });

  it('FR-003: returns floats in [0, 1)', () => {
    const rng = createRng(2024);
    for (let i = 0; i < 5000; i++) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('FR-004: accepts seeds outside the 32-bit range by folding them', () => {
    // Documented behaviour, not a defect: the generator is 32-bit, so a seed is
    // truncated into that range. 2^32 therefore aliases 0. What matters for
    // FR-004 is that the folding is deterministic and never throws.
    expect(take(10, 2 ** 32)).toEqual(take(10, 0));
    expect(take(10, 2 ** 32)).toEqual(take(10, 2 ** 32));
    expect(take(10, -5)).toEqual(take(10, -5));
    expect(take(10, 3.9)).toEqual(take(10, 3));
  });
});
