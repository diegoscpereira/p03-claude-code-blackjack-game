import { readRecord, writeRecord } from '../../sync/storage';

/**
 * T049 — tutorial state, backed by `bj.tutorial` (data-model.md Part 3).
 *
 * Device-scoped and never sent to the server: whether someone has seen an
 * onboarding flow is not progression, and FR-054 keeps stored records free of
 * anything that is not gameplay statistics.
 */
export const TUTORIAL_KEY = 'bj.tutorial';

export interface TutorialState {
  /** FR-043: dismissed once means never offered again on this device. */
  dismissed: boolean;
  completed: boolean;
  /** FR-046: where a re-entry resumes from. */
  lastStep: number;
}

const DEFAULTS: TutorialState = { dismissed: false, completed: false, lastStep: 0 };

/** Field-by-field validation: one bad field degrades to its default, not the record. */
function parse(value: unknown): TutorialState {
  const record = value as Partial<Record<keyof TutorialState, unknown>>;
  return {
    dismissed: typeof record.dismissed === 'boolean' ? record.dismissed : DEFAULTS.dismissed,
    completed: typeof record.completed === 'boolean' ? record.completed : DEFAULTS.completed,
    lastStep:
      typeof record.lastStep === 'number' && Number.isFinite(record.lastStep) && record.lastStep >= 0
        ? Math.trunc(record.lastStep)
        : DEFAULTS.lastStep,
  };
}

export function readTutorialState(): TutorialState {
  return readRecord(TUTORIAL_KEY, DEFAULTS, parse);
}

/** Merges a patch into the stored record and returns the result. */
export function writeTutorialState(patch: Partial<TutorialState>): TutorialState {
  const next = { ...readTutorialState(), ...patch };
  writeRecord(TUTORIAL_KEY, next);
  return next;
}

/** FR-040, FR-043: offered on a first visit, and never again after that. */
export function shouldOfferTutorial(): boolean {
  const state = readTutorialState();
  return !state.dismissed && !state.completed;
}
