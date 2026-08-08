import { describe, expect, it } from 'vitest';
import { evAccuracy, formatEvAccuracy } from '../../../src/progression/accuracy';

/**
 * T091 — FR-024a, FR-024b: the EV accuracy score is *derived*, never stored.
 *
 * data-model.md is explicit that this is not a column: a stored score can
 * disagree with its own inputs after a partial sync. Deriving it from the two
 * counters on every read makes that disagreement impossible to represent, and
 * these tests exist to keep it that way.
 */

describe('EV accuracy derivation (FR-024a)', () => {
  it('FR-024b: is unavailable — not zero — before any decision is taken', () => {
    expect(evAccuracy(0, 0)).toBeNull();
    expect(formatEvAccuracy(0, 0)).toBe('—');
  });

  it('FR-024a: is the lifetime match rate as a percentage', () => {
    expect(evAccuracy(4, 1)).toBe(25);
    expect(evAccuracy(2, 1)).toBe(50);
    expect(evAccuracy(64, 51)).toBeCloseTo(79.6875, 6);
  });

  it('FR-024a: a perfect record is 100%', () => {
    expect(evAccuracy(37, 37)).toBe(100);
  });

  it('FR-024a: a record with no matches is 0%, which is distinct from unavailable', () => {
    expect(evAccuracy(12, 0)).toBe(0);
    expect(evAccuracy(12, 0)).not.toBeNull();
  });

  it('FR-024a: the score never exceeds 100% even if the counters disagree', () => {
    // Counters reconcile independently (boundary rule 4), so a partial sync can
    // briefly leave `matched` ahead of `taken`. Clamping keeps the *display*
    // sane without corrupting either counter.
    expect(evAccuracy(10, 12)).toBe(100);
  });

  it('FR-024b: treats a negative or non-finite counter as unavailable', () => {
    expect(evAccuracy(-1, 0)).toBeNull();
    expect(evAccuracy(Number.NaN, 3)).toBeNull();
  });

  it('FR-024a: formats to one decimal place with a percent sign', () => {
    expect(formatEvAccuracy(64, 51)).toBe('79.7%');
    expect(formatEvAccuracy(4, 1)).toBe('25.0%');
    expect(formatEvAccuracy(1, 1)).toBe('100.0%');
  });
});
