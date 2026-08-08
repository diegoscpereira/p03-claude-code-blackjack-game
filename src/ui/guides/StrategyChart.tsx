import { UPCARDS, chartRows } from '../../strategy/chart';
import type { ChartFamily } from '../../strategy/chart';
import type { Action } from '../../engine/types';

/**
 * T110 — an unlockable chart (FR-051a, FR-051c).
 *
 * Every cell is a lookup into the same `ev-tables.json` the companion reads, so
 * a chart and a live recommendation cannot disagree — FR-051c is satisfied by
 * there being one source, not by two sources being checked against each other.
 */

const CELL_LABEL: Record<Action, string> = {
  hit: 'H',
  stand: 'S',
  double: 'D',
  split: 'P',
  surrender: 'R',
};

const CELL_TONE: Record<Action, string> = {
  hit: 'bg-loss/25 text-ink',
  stand: 'bg-win/25 text-ink',
  double: 'bg-accent/25 text-ink',
  split: 'bg-panel text-ink',
  surrender: 'bg-felt text-ink',
};

export function StrategyChart({ family }: { family: ChartFamily }) {
  const rows = chartRows(family);

  return (
    // NFR-010: wide content scrolls inside its own container rather than making
    // the page scroll sideways.
    <div className="overflow-x-auto" data-testid={`chart-${family}`}>
      <table className="w-full min-w-[28rem] border-separate border-spacing-0.5 text-center text-xs">
        <caption className="sr-only">
          Recommended action by hand and dealer upcard, for six decks, dealer hits soft 17
        </caption>
        <thead>
          <tr>
            <th scope="col" className="px-2 py-1 text-ink-muted">
              Hand
            </th>
            {UPCARDS.map((upcard) => (
              <th key={upcard} scope="col" className="px-2 py-1 font-semibold text-ink-muted">
                {upcard}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.shape}>
              <th scope="row" className="px-2 py-1 text-right font-semibold text-ink">
                {row.label}
              </th>
              {row.actions.map((action, index) => (
                <td
                  key={UPCARDS[index]}
                  className={`rounded px-2 py-1 font-semibold ${action ? CELL_TONE[action] : ''}`}
                >
                  {/* The letter is decorative shorthand; the accessible name
                      carries the full action, so the chart is readable without
                      the legend and without colour (NFR-008). */}
                  <span aria-hidden="true">{action ? CELL_LABEL[action] : '—'}</span>
                  <span className="sr-only">{action ?? 'no recommendation'}</span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <p className="mt-2 text-xs text-ink-muted">
        H hit · S stand · D double · P split
      </p>
    </div>
  );
}
