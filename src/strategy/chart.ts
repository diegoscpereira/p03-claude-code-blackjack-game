import tables from './data/ev-tables.json';
import type { Action } from '../engine/types';

/**
 * T070 — the basic strategy chart, read straight off the EV tables.
 *
 * This exists so the unlockable guides have a source, and FR-051c is specific
 * about which source that must be: *"Guide contents SHALL be derived from the
 * same strategy source the companion uses, so an unlocked chart and a live
 * recommendation can never disagree."*
 *
 * The cheap way to satisfy that sentence would be to ship a second, hand-typed
 * chart and trust that it matches. Deriving both from `ev-tables.json` makes
 * agreement structural: there is only one set of numbers, and a guide cell and
 * a live recommendation are the same lookup asked at different times.
 */

type SolvedPoint = Partial<Record<Action, number>>;

const ENTRIES = tables.entries as Record<string, SolvedPoint>;

/** The ten columns every chart family shares. */
export const UPCARDS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'A'] as const;

export type ChartFamily = 'hard' | 'soft' | 'pair';

const HARD_ROWS = Array.from({ length: 18 }, (_, i) => `hard-${i + 4}`);
const SOFT_ROWS = Array.from({ length: 8 }, (_, i) => `soft-${i + 12}`);
const PAIR_ROWS = ['pair-A', ...Array.from({ length: 9 }, (_, i) => `pair-${i + 2}`)];

export const CHART_ROWS: Record<ChartFamily, readonly string[]> = {
  hard: HARD_ROWS,
  soft: SOFT_ROWS,
  pair: PAIR_ROWS,
};

/** How a row reads to a player: `hard-16` → `16`, `pair-8` → `8,8`. */
export function rowLabel(shape: string): string {
  const [family, value] = shape.split('-');
  if (family === 'pair') return `${value},${value}`;
  if (family === 'soft') return `A,${Number(value) - 11}`;
  return String(value);
}

/**
 * The charted action for a decision point — the highest-EV action at that cell.
 *
 * Unlike `rankActions`, this does not filter by legality: a chart row assumes
 * the first two cards, where Double and Split are on the table. Filtering here
 * would quietly turn every pair row into a hit-or-stand row.
 */
export function chartAction(shape: string, upcard: string): Action | null {
  const point = ENTRIES[`${shape}|${upcard}`];
  if (!point) return null;

  let best: Action | null = null;
  let bestEv = -Infinity;
  for (const [action, ev] of Object.entries(point) as [Action, number][]) {
    if (ev > bestEv) {
      bestEv = ev;
      best = action;
    }
  }
  return best;
}

export interface ChartRow {
  readonly shape: string;
  readonly label: string;
  readonly actions: readonly (Action | null)[];
}

/** A whole family as rows and columns, ready to render (FR-051a). */
export function chartRows(family: ChartFamily): ChartRow[] {
  return CHART_ROWS[family].map((shape) => ({
    shape,
    label: rowLabel(shape),
    actions: UPCARDS.map((upcard) => chartAction(shape, upcard)),
  }));
}
