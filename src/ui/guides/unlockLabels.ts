import { LEVELS } from '../../progression/levels';
import type { UnlockId } from '../../progression/levels';
import type { ChartFamily } from '../../strategy/chart';

/** How each unlock is named, and what it opens (FR-051a, FR-051b). */
export const UNLOCK_LABELS: Record<UnlockId, string> = {
  post_game_analysis: 'the post-game analysis view',
  basic_strategy_chart: 'the basic strategy chart',
  soft_hands_chart: 'the soft-hands chart',
  splitting_chart: 'the splitting chart',
};

/** The chart family a guide shows, or `null` for the analysis view. */
export const UNLOCK_FAMILY: Record<UnlockId, ChartFamily | null> = {
  post_game_analysis: null,
  basic_strategy_chart: 'hard',
  soft_hands_chart: 'soft',
  splitting_chart: 'pair',
};

/** FR-051b: a locked guide shows the level that opens it, not its contents. */
export function levelFor(unlock: UnlockId): number {
  return LEVELS.find((tier) => tier.unlock === unlock)?.level ?? 1;
}
