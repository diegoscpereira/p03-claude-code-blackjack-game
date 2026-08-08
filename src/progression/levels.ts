/**
 * T099 — FR-051d: the ten-level ladder, written out rather than computed.
 *
 * The thresholds are a literal table because the spec states them as one. A
 * closed-form curve that happened to reproduce these ten numbers would be a
 * different contract wearing the same values, and the first time someone tuned
 * the curve the ladder would drift out from under the tests.
 */

export type UnlockId =
  | 'post_game_analysis'
  | 'basic_strategy_chart'
  | 'soft_hands_chart'
  | 'splitting_chart';

export interface LevelTier {
  readonly level: number;
  /** Cumulative lifetime XP at which this level begins. */
  readonly xp: number;
  readonly unlock: UnlockId | null;
}

export const LEVELS: readonly LevelTier[] = [
  { level: 1, xp: 0, unlock: null },
  { level: 2, xp: 50, unlock: 'post_game_analysis' },
  { level: 3, xp: 120, unlock: null },
  { level: 4, xp: 220, unlock: 'basic_strategy_chart' },
  { level: 5, xp: 350, unlock: null },
  { level: 6, xp: 520, unlock: 'soft_hands_chart' },
  { level: 7, xp: 730, unlock: null },
  { level: 8, xp: 990, unlock: 'splitting_chart' },
  { level: 9, xp: 1300, unlock: null },
  { level: 10, xp: 1700, unlock: null },
];

export const MAX_LEVEL = 10;

/** Every unlock in ladder order — the canonical ordering for a merged set. */
export const ALL_UNLOCKS: readonly UnlockId[] = LEVELS.map((tier) => tier.unlock).filter(
  (unlock): unlock is UnlockId => unlock !== null,
);

export function isUnlockId(value: unknown): value is UnlockId {
  return typeof value === 'string' && (ALL_UNLOCKS as readonly string[]).includes(value);
}

/**
 * The level a lifetime XP total corresponds to. Tolerates rubbish rather than
 * throwing: this runs against reconciled state that may have arrived from a
 * previous schema, and a crash here would cost the session.
 */
export function levelForXp(xp: number): number {
  if (!Number.isFinite(xp) || xp <= 0) return 1;

  let level = 1;
  for (const tier of LEVELS) {
    if (xp >= tier.xp) level = tier.level;
  }
  return level;
}

/** Every unlock granted at or below a level (FR-051). */
export function unlocksThrough(level: number): UnlockId[] {
  return LEVELS.filter((tier) => tier.level <= level && tier.unlock !== null).map(
    (tier) => tier.unlock as UnlockId,
  );
}

/**
 * FR-051e: XP remaining to the next level, or `null` at the ceiling. Level 10
 * is presented as a completed ladder, not as a pending eleventh level, so the
 * absence of a next threshold is modelled rather than faked with a large number.
 */
export function xpToNextLevel(xp: number): number | null {
  const next = LEVELS.find((tier) => tier.xp > xp);
  return next ? next.xp - xp : null;
}

export interface XpResult {
  readonly xp: number;
  readonly level: number;
  /** One per threshold crossed — a single award can cross several (FR-051). */
  readonly levelsGained: number;
  readonly newUnlocks: readonly UnlockId[];
}

/**
 * Applies an award to a lifetime total (FR-051).
 *
 * A large award crossing three thresholds raises the level three times and
 * grants all three unlocks, rather than advancing one level and quietly losing
 * the rest — which is the bug this returns `levelsGained` to make visible.
 */
export function applyXp(currentXp: number, award: number): XpResult {
  const before = Number.isFinite(currentXp) && currentXp > 0 ? currentXp : 0;
  const xp = before + Math.max(0, award);

  const previousLevel = levelForXp(before);
  const level = levelForXp(xp);

  return {
    xp,
    level,
    levelsGained: level - previousLevel,
    newUnlocks: unlocksThrough(level).filter(
      (unlock) => !unlocksThrough(previousLevel).includes(unlock),
    ),
  };
}
