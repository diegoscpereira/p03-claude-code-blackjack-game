/**
 * T069 — writes `src/strategy/data/ev-tables.json`.
 *
 * The table is generated, not committed (see .gitignore), so a reviewer cannot
 * read a number here without the code that produced it. `npm run generate:ev`
 * is therefore a prerequisite of the build, and CI runs it before typecheck.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { DECK_KEYS, allShapes, solveDecisionPoint, type SolvedPoint } from './ev-solver';
import { PHASE_1_RULES } from '../src/engine/rules-config';

const OUTPUT = 'src/strategy/data/ev-tables.json';

/** NFR-004 budgets 2s to an interactive table; the table has to stay small. */
const SIZE_BUDGET_BYTES = 80 * 1024;

interface EvTables {
  rules: typeof PHASE_1_RULES;
  /** Keyed `${shape}|${dealerUpcard}`. */
  entries: Record<string, SolvedPoint>;
}

/** Four decimals is finer than any decision needs and halves the file size. */
function round4(point: SolvedPoint): SolvedPoint {
  const out: SolvedPoint = {};
  for (const [action, value] of Object.entries(point)) {
    if (value !== undefined) out[action as keyof SolvedPoint] = Math.round(value * 1e4) / 1e4;
  }
  return out;
}

function main(): void {
  const entries: Record<string, SolvedPoint> = {};

  for (const shape of allShapes()) {
    for (const upcard of DECK_KEYS) {
      entries[`${shape}|${upcard}`] = round4(solveDecisionPoint(shape, upcard, PHASE_1_RULES));
    }
  }

  const tables: EvTables = { rules: PHASE_1_RULES, entries };
  const json = JSON.stringify(tables);

  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, json);

  const bytes = Buffer.byteLength(json);
  console.error(
    `generate:ev — ${Object.keys(entries).length} decision points, ${(bytes / 1024).toFixed(1)}KB`,
  );

  if (bytes > SIZE_BUDGET_BYTES) {
    console.error(`generate:ev FAILED — ${bytes} bytes exceeds the ${SIZE_BUDGET_BYTES} budget.`);
    process.exit(1);
  }
}

main();
