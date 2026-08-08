import { describe, expect, it } from 'vitest';
import { CHART_ROWS, UPCARDS, chartAction, chartRows, rowLabel } from '../../../src/strategy/chart';
import { recommend } from '../../../src/strategy/ev';
import { shapeOf, upcardKey } from '../../../src/strategy/shape';
import { PHASE_1_RULES } from '../../../src/engine/rules-config';
import { REFERENCE_CHART } from '../../fixtures/basic-strategy';
import { cards, cardsForShape, hand, round } from '../../helpers/hands';
import type { ChartFamily } from '../../../src/strategy/chart';
import type { Action, Rank } from '../../../src/engine/types';

/**
 * The unlockable guides' data source (FR-051a, FR-051b, FR-051c).
 *
 * FR-051c is the requirement with teeth: *"Guide contents SHALL be derived from
 * the same strategy source the companion uses, so an unlocked chart and a live
 * recommendation can never disagree."*
 *
 * The cheap way to pass that sentence would be to ship a second, hand-typed
 * chart and hope it matched. `chart.ts` reads `ev-tables.json` — the same file
 * `ev.ts` reads — so this file's job is to prove the two really do agree cell
 * for cell, rather than merely sharing an import.
 */

const rules = PHASE_1_RULES;
const FAMILIES: ChartFamily[] = ['hard', 'soft', 'pair'];

/** The same state construction the companion's own chart test uses. */
function stateFor(shape: string, dealerUpcard: Rank) {
  return round({
    playerHands: [hand(cardsForShape(shape))],
    dealerHand: hand(`${dealerUpcard},7`, { id: 'dealer' }),
    availableBankroll: 1000,
  });
}

describe('chart structure (FR-051a)', () => {
  it('FR-051a: covers the three families a player is shown', () => {
    expect(CHART_ROWS.hard).toHaveLength(18);
    expect(CHART_ROWS.soft).toHaveLength(8);
    expect(CHART_ROWS.pair).toHaveLength(10);
  });

  it('FR-051a: has the ten dealer columns the chart is defined over', () => {
    expect(UPCARDS).toEqual(['2', '3', '4', '5', '6', '7', '8', '9', '10', 'A']);
  });

  it.each(FAMILIES)('FR-051a: every %s row resolves an action for every column', (family) => {
    for (const row of chartRows(family)) {
      expect(row.actions).toHaveLength(UPCARDS.length);
      // A gap in the chart would render as an em dash to the player — a guide
      // with holes is worse than no guide, so there must be none.
      expect(row.actions.every((action) => action !== null)).toBe(true);
    }
  });

  it.each(FAMILIES)('FR-051a: %s rows are labelled the way a player reads them', (family) => {
    for (const row of chartRows(family)) {
      expect(row.label.length).toBeGreaterThan(0);
      expect(row.label).not.toContain('-');
    }
  });

  it('FR-051a: labels name the hand rather than its internal key', () => {
    expect(rowLabel('hard-16')).toBe('16');
    expect(rowLabel('soft-18')).toBe('A,7');
    expect(rowLabel('pair-8')).toBe('8,8');
    expect(rowLabel('pair-A')).toBe('A,A');
  });
});

describe('chartAction (FR-051c)', () => {
  it('FR-051c: returns the highest-EV action at a cell', () => {
    expect(chartAction('hard-20', '9')).toBe('stand');
    expect(chartAction('hard-16', '10')).toBe('hit');
    expect(chartAction('hard-11', '6')).toBe('double');
    expect(chartAction('pair-8', '10')).toBe('split');
  });

  it('FR-051b: returns null for a cell the tables do not define', () => {
    // Never a fabricated fallback. A guide inventing an action would be the
    // one failure mode worse than a missing one.
    expect(chartAction('hard-99', '10')).toBeNull();
    expect(chartAction('pair-8', 'Z')).toBeNull();
  });
});

/**
 * A row is comparable only if real cards produce that very shape. `hard-4` and
 * `soft-12` are the exceptions: the only two-card hands totalling them are 2,2
 * and A,A, which the engine classifies as pairs. The chart still prints those
 * rows — a chart with gaps reads as broken — but a live hand can never land on
 * them, so comparing them here would be asserting about an unreachable state.
 */
function isReachable(shape: string): boolean {
  try {
    return shapeOf(cards(cardsForShape(shape))) === shape;
  } catch {
    return false;
  }
}

describe('the guides and the companion cannot disagree (FR-051c)', () => {
  it.each(FAMILIES)('FR-051c: every reachable %s cell matches the live recommendation', (family) => {
    const disagreements: string[] = [];
    const rows = chartRows(family).filter((row) => isReachable(row.shape));
    expect(rows.length).toBeGreaterThan(5);

    for (const row of rows) {
      for (const [index, action] of row.actions.entries()) {
        const upcard = UPCARDS[index] as Rank;
        const live = recommend(stateFor(row.shape, upcard), rules);
        if (live !== action) disagreements.push(`${row.shape} vs ${upcard}: ${action} != ${live}`);
      }
    }

    expect(disagreements).toEqual([]);
  });

  it('FR-051c: the chart keys resolve through the same shape function the engine uses', () => {
    // If `shapeOf` and the chart's row keys ever drifted, every assertion above
    // would still pass while the guide showed the wrong row for a real hand.
    expect(shapeOf(cards(cardsForShape('hard-16')))).toBe('hard-16');
    expect(shapeOf(cards(cardsForShape('soft-18')))).toBe('soft-18');
    expect(shapeOf(cards(cardsForShape('pair-8')))).toBe('pair-8');
    expect(upcardKey('K')).toBe('10');
  });

  it('FR-051a: the two unreachable rows are exactly the ones the pair rows cover', () => {
    // Naming them explicitly, so that if a rules change made them reachable the
    // filter above would stop silently excluding a row that now matters.
    const unreachable = FAMILIES.flatMap((family) =>
      chartRows(family).map((row) => row.shape),
    ).filter((shape) => !isReachable(shape));

    expect(unreachable).toEqual(['hard-4', 'soft-12']);
  });
});

describe('the chart agrees with the published reference (SC-003)', () => {
  it('SC-003: matches the reference fixture at every charted cell', () => {
    const disagreements: string[] = [];

    for (const entry of REFERENCE_CHART) {
      const actual = chartAction(entry.shape, upcardKey(entry.dealerUpcard));
      if (actual !== (entry.action as Action)) {
        disagreements.push(`${entry.shape} vs ${entry.dealerUpcard}: ${actual} != ${entry.action}`);
      }
    }

    // research.md R1: a disagreement here is a generator bug, never a chart
    // disagreement. Do not adjust the fixture to make this pass.
    expect(disagreements).toEqual([]);
  });
});
