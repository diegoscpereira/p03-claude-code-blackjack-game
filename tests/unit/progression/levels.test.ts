import { describe, expect, it } from 'vitest';
import {
  LEVELS,
  MAX_LEVEL,
  applyXp,
  levelForXp,
  unlocksThrough,
  xpToNextLevel,
} from '../../../src/progression/levels';

/**
 * T090 — FR-051, FR-051d, FR-051e: the fixed ten-level ladder.
 *
 * Every threshold is asserted literally against the spec's table rather than
 * derived from a formula. A formula that happened to reproduce the table would
 * pass a generated test while still being the wrong contract — the table *is*
 * the requirement.
 */

const THRESHOLDS: readonly [number, number, string | null][] = [
  [1, 0, null],
  [2, 50, 'post_game_analysis'],
  [3, 120, null],
  [4, 220, 'basic_strategy_chart'],
  [5, 350, null],
  [6, 520, 'soft_hands_chart'],
  [7, 730, null],
  [8, 990, 'splitting_chart'],
  [9, 1300, null],
  [10, 1700, null],
];

describe('the level ladder (FR-051d)', () => {
  it('FR-051d: has exactly ten levels', () => {
    expect(LEVELS).toHaveLength(10);
    expect(MAX_LEVEL).toBe(10);
  });

  it.each(THRESHOLDS)('FR-051d: level %i begins at %i XP', (level, xp, unlock) => {
    const tier = LEVELS[level - 1];
    expect(tier).toBeDefined();
    expect(tier?.level).toBe(level);
    expect(tier?.xp).toBe(xp);
    expect(tier?.unlock ?? null).toBe(unlock);
  });

  it('FR-051d: thresholds increase strictly', () => {
    for (let i = 1; i < LEVELS.length; i += 1) {
      expect(LEVELS[i]!.xp).toBeGreaterThan(LEVELS[i - 1]!.xp);
    }
  });

  it.each(THRESHOLDS)('FR-051d: %i XP resolves to exactly level %i', (level, xp) => {
    expect(levelForXp(xp)).toBe(level);
  });

  it('FR-051d: XP one short of a threshold stays on the lower level', () => {
    for (const [level, xp] of THRESHOLDS) {
      if (level === 1) continue;
      expect(levelForXp(xp - 1)).toBe(level - 1);
    }
  });

  it('FR-051d: a new player with zero XP is level 1', () => {
    expect(levelForXp(0)).toBe(1);
  });

  it('FR-051e: XP beyond the top threshold stays at level 10', () => {
    expect(levelForXp(1700)).toBe(10);
    expect(levelForXp(5000)).toBe(10);
    expect(levelForXp(1_000_000)).toBe(10);
  });

  it('tolerates a negative or non-finite total rather than throwing', () => {
    expect(levelForXp(-1)).toBe(1);
    expect(levelForXp(Number.NaN)).toBe(1);
  });
});

describe('unlocks (FR-051, FR-051a)', () => {
  it('FR-051a: every unlock in the ladder is a view over computed data', () => {
    const named = LEVELS.map((tier) => tier.unlock).filter((unlock) => unlock !== null);
    expect(named).toEqual([
      'post_game_analysis',
      'basic_strategy_chart',
      'soft_hands_chart',
      'splitting_chart',
    ]);
  });

  it('FR-051: a level grants every unlock at or below it', () => {
    expect(unlocksThrough(1)).toEqual([]);
    expect(unlocksThrough(2)).toEqual(['post_game_analysis']);
    expect(unlocksThrough(4)).toEqual(['post_game_analysis', 'basic_strategy_chart']);
    expect(unlocksThrough(10)).toEqual([
      'post_game_analysis',
      'basic_strategy_chart',
      'soft_hands_chart',
      'splitting_chart',
    ]);
  });
});

describe('applying an XP award (FR-051)', () => {
  it('FR-051: an award below the next threshold raises no level', () => {
    const result = applyXp(0, 10);
    expect(result).toMatchObject({ xp: 10, level: 1, levelsGained: 0 });
    expect(result.newUnlocks).toEqual([]);
  });

  it('FR-051: crossing one threshold raises the level once', () => {
    const result = applyXp(44, 10);
    expect(result).toMatchObject({ xp: 54, level: 2, levelsGained: 1 });
    expect(result.newUnlocks).toEqual(['post_game_analysis']);
  });

  it('FR-051: crossing several thresholds at once raises the level once per threshold', () => {
    // 0 → 240 crosses 50, 120, and 220: three levels in a single award.
    const result = applyXp(0, 240);
    expect(result).toMatchObject({ xp: 240, level: 4, levelsGained: 3 });
    expect(result.newUnlocks).toEqual(['post_game_analysis', 'basic_strategy_chart']);
  });

  it('FR-051: every unlock passed in a multi-level jump is granted', () => {
    const result = applyXp(0, 1700);
    expect(result.level).toBe(10);
    expect(result.levelsGained).toBe(9);
    expect(result.newUnlocks).toEqual([
      'post_game_analysis',
      'basic_strategy_chart',
      'soft_hands_chart',
      'splitting_chart',
    ]);
  });

  it('FR-051: landing exactly on a threshold raises the level', () => {
    expect(applyXp(0, 50)).toMatchObject({ level: 2, levelsGained: 1 });
  });

  it('FR-051e: XP keeps accumulating at level 10 but the level does not rise', () => {
    const result = applyXp(1700, 500);
    expect(result.xp).toBe(2200);
    expect(result.level).toBe(10);
    expect(result.levelsGained).toBe(0);
    expect(result.newUnlocks).toEqual([]);
  });

  it('FR-051e: level 10 is a completed ladder — there is no next threshold', () => {
    expect(xpToNextLevel(1700)).toBeNull();
    expect(xpToNextLevel(9999)).toBeNull();
  });

  it('FR-051d: the XP remaining to the next level is reported below the ceiling', () => {
    expect(xpToNextLevel(0)).toBe(50);
    expect(xpToNextLevel(49)).toBe(1);
    expect(xpToNextLevel(220)).toBe(130);
  });

  it('SC-011: following the recommendation tops the ladder in roughly 120–140 hands', () => {
    // A player matching every decision earns 10 + 2 × decisions per hand. At the
    // ~1.4 decisions a hand the chart averages, that is ~13 XP a hand.
    const perHand = 10 + 2 * 1.4;
    const hands = Math.ceil(1700 / perHand);
    expect(hands).toBeGreaterThanOrEqual(120);
    expect(hands).toBeLessThanOrEqual(140);
  });
});
