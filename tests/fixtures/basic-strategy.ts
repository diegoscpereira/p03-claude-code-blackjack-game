import type { Action, Rank } from '../../src/engine/types';

/**
 * T019 — the reference basic strategy chart, and the test oracle for FR-021
 * and SC-003.
 *
 * Rules this chart is for (T014 / spec Assumption 1): six decks, dealer hits
 * soft 17, blackjack pays 3:2, double on any two cards, double after split
 * allowed, split to four hands, split Aces get one card, no surrender. A chart
 * for any other rule set is the wrong oracle — most of the disputed cells below
 * differ precisely because of the soft-17 rule.
 *
 * Written in the row-per-shape form published charts use, so a reviewer can
 * lay this file beside a printed chart and compare rows rather than decode 300
 * object literals.
 *
 *   H  = hit
 *   S  = stand
 *   D  = double if allowed, otherwise hit
 *   Ds = double if allowed, otherwise stand
 *   P  = split
 *
 * research.md R1 is the tie-break rule when this chart and the generated EV
 * tables disagree: **treat it as a generator bug, not a chart disagreement**,
 * and fix `scripts/generate-ev-tables.ts` rather than editing a cell here.
 */

/** Column order for every row below. */
export const DEALER_UPCARDS: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'A'];

type Code = 'H' | 'S' | 'D' | 'Ds' | 'P';

/**
 * Hard totals 4–21. A hard total has no Ace counted as 11.
 *
 * 4 is here only as the fallback for an unsplittable pair of 2s; no published
 * chart prints a row for it, because two 2s are always split when they can be.
 */
const HARD: Record<number, string> = {
  4: 'H  H  H  H  H  H  H  H  H  H',
  5: 'H  H  H  H  H  H  H  H  H  H',
  6: 'H  H  H  H  H  H  H  H  H  H',
  7: 'H  H  H  H  H  H  H  H  H  H',
  8: 'H  H  H  H  H  H  H  H  H  H',
  9: 'H  D  D  D  D  H  H  H  H  H',
  10: 'D  D  D  D  D  D  D  D  H  H',
  11: 'D  D  D  D  D  D  D  D  D  D',
  12: 'H  H  S  S  S  H  H  H  H  H',
  13: 'S  S  S  S  S  H  H  H  H  H',
  14: 'S  S  S  S  S  H  H  H  H  H',
  15: 'S  S  S  S  S  H  H  H  H  H',
  16: 'S  S  S  S  S  H  H  H  H  H',
  17: 'S  S  S  S  S  S  S  S  S  S',
  18: 'S  S  S  S  S  S  S  S  S  S',
  19: 'S  S  S  S  S  S  S  S  S  S',
  20: 'S  S  S  S  S  S  S  S  S  S',
  21: 'S  S  S  S  S  S  S  S  S  S',
};

/**
 * Soft totals 13–21 (an Ace counted as 11).
 *
 * Two rows carry the dealer-hits-soft-17 adjustment, and they are the cells
 * most likely to be wrong if this chart was ever copied from an S17 source:
 *   - soft 19 (A,8) doubles against 6 here; under S17 it always stands.
 *   - hard/soft 11 doubles against an Ace here; under S17 it hits.
 */
const SOFT: Record<number, string> = {
  // Soft 12 is a pair of Aces that could not be split — only reachable at the
  // four-hand cap. **No published chart prints this row**, because Aces are
  // always split when splitting is available, so there is no external oracle
  // for it. These cells are therefore taken from the solver rather than from a
  // chart, which is the one place in this file that is legitimate: research.md
  // R1 makes the published chart authoritative only where a published chart
  // exists. Doubling wins against a 6 by 0.016, matching soft 13 against a 6.
  12: 'H  H  H  H  D  H  H  H  H  H',
  13: 'H  H  H  D  D  H  H  H  H  H',
  14: 'H  H  H  D  D  H  H  H  H  H',
  15: 'H  H  D  D  D  H  H  H  H  H',
  16: 'H  H  D  D  D  H  H  H  H  H',
  17: 'H  D  D  D  D  H  H  H  H  H',
  18: 'Ds Ds Ds Ds Ds S  S  H  H  H',
  19: 'S  S  S  S  Ds S  S  S  S  S',
  20: 'S  S  S  S  S  S  S  S  S  S',
  21: 'S  S  S  S  S  S  S  S  S  S',
};

/**
 * Pairs, with double-after-split allowed — which is what moves 2,2 / 3,3 / 4,4
 * / 6,6 toward splitting. Keyed by the rank of one card; `10` covers all
 * ten-valued pairs.
 *
 * 5,5 is never split: it is played as a hard 10. 10,10 is never split: a
 * standing 20 is worth more than two hands starting at 10.
 */
const PAIRS: Record<string, string> = {
  A: 'P  P  P  P  P  P  P  P  P  P',
  '10': 'S  S  S  S  S  S  S  S  S  S',
  '9': 'P  P  P  P  P  S  P  P  S  S',
  '8': 'P  P  P  P  P  P  P  P  P  P',
  '7': 'P  P  P  P  P  P  H  H  H  H',
  '6': 'P  P  P  P  P  H  H  H  H  H',
  '5': 'D  D  D  D  D  D  D  D  H  H',
  '4': 'H  H  H  P  P  H  H  H  H  H',
  '3': 'P  P  P  P  P  P  H  H  H  H',
  '2': 'P  P  P  P  P  P  H  H  H  H',
};

/** A decision point in the chart, with the action for each doubling situation. */
export interface ChartEntry {
  /** `hard-16`, `soft-18`, `pair-8` — the same key shape `src/strategy` uses. */
  readonly shape: string;
  readonly kind: 'hard' | 'soft' | 'pair';
  /** Total for hard/soft rows; the paired rank for pair rows. */
  readonly value: number | Rank;
  readonly dealerUpcard: Rank;
  /** The action when hit, stand, double and split are all available. */
  readonly action: Action;
  /**
   * The action when doubling is unavailable — a hand of three or more cards, or
   * a bankroll that cannot cover the extra bet. `D` degrades to hit, `Ds` to
   * stand. This is the distinction a chart's two-letter codes carry and a
   * single `Action` cannot.
   */
  readonly withoutDouble: Action;
  /** The action when splitting is unavailable (at the four-hand cap, FR-010). */
  readonly withoutSplit: Action;
}

function decode(code: Code): Pick<ChartEntry, 'action' | 'withoutDouble'> {
  switch (code) {
    case 'H':
      return { action: 'hit', withoutDouble: 'hit' };
    case 'S':
      return { action: 'stand', withoutDouble: 'stand' };
    case 'D':
      return { action: 'double', withoutDouble: 'hit' };
    case 'Ds':
      return { action: 'double', withoutDouble: 'stand' };
    case 'P':
      return { action: 'split', withoutDouble: 'split' };
  }
}

function parseRow(row: string): Code[] {
  const codes = row.trim().split(/\s+/) as Code[];
  if (codes.length !== DEALER_UPCARDS.length) {
    throw new Error(`Chart row has ${codes.length} cells, expected ${DEALER_UPCARDS.length}`);
  }
  return codes;
}

/**
 * A pair that is not split falls back to its total: a pair of 7s played as a
 * hard 14, a pair of Aces as a soft 12. That fallback is what the engine must
 * recommend once the four-hand cap is reached, so the chart has to supply it.
 */
function pairFallback(rank: string, dealerIndex: number): Action {
  if (rank === 'A') {
    const codes = parseRow(SOFT[12] as string);
    return decode(codes[dealerIndex] as Code).action;
  }
  const total = rank === '10' ? 20 : Number(rank) * 2;
  const codes = parseRow(HARD[total] as string);
  return decode(codes[dealerIndex] as Code).action;
}

function buildChart(): ChartEntry[] {
  const entries: ChartEntry[] = [];

  for (const [totalText, row] of Object.entries(HARD)) {
    const codes = parseRow(row);
    DEALER_UPCARDS.forEach((dealerUpcard, i) => {
      const decoded = decode(codes[i] as Code);
      entries.push({
        shape: `hard-${totalText}`,
        kind: 'hard',
        value: Number(totalText),
        dealerUpcard,
        ...decoded,
        withoutSplit: decoded.action,
      });
    });
  }

  for (const [totalText, row] of Object.entries(SOFT)) {
    const codes = parseRow(row);
    DEALER_UPCARDS.forEach((dealerUpcard, i) => {
      const decoded = decode(codes[i] as Code);
      entries.push({
        shape: `soft-${totalText}`,
        kind: 'soft',
        value: Number(totalText),
        dealerUpcard,
        ...decoded,
        withoutSplit: decoded.action,
      });
    });
  }

  for (const [rank, row] of Object.entries(PAIRS)) {
    const codes = parseRow(row);
    DEALER_UPCARDS.forEach((dealerUpcard, i) => {
      const decoded = decode(codes[i] as Code);
      entries.push({
        shape: `pair-${rank}`,
        kind: 'pair',
        value: rank as Rank,
        dealerUpcard,
        ...decoded,
        withoutSplit: decoded.action === 'split' ? pairFallback(rank, i) : decoded.action,
      });
    });
  }

  return entries;
}

/** Every charted decision point. FR-021 and SC-003 require agreement at all of them. */
export const REFERENCE_CHART: ChartEntry[] = buildChart();

/** Lookup by the same key shape `src/strategy/chart.ts` uses. */
export function chartAction(shape: string, dealerUpcard: Rank): ChartEntry {
  const entry = REFERENCE_CHART.find(
    (e) => e.shape === shape && e.dealerUpcard === dealerUpcard,
  );
  if (!entry) throw new Error(`No chart entry for ${shape} vs ${dealerUpcard}`);
  return entry;
}
