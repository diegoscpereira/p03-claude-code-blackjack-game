import { beforeEach, describe, expect, it } from 'vitest';
import {
  TUTORIAL_KEY,
  readTutorialState,
  shouldOfferTutorial,
  writeTutorialState,
} from '../../src/ui/tutorial/tutorialState';
import { clearLocalState, rawWrite } from '../../src/sync/storage';

/**
 * T046 — FR-043, FR-046: tutorial state round-trips through local storage.
 *
 * Runs in the Node environment with no DOM, which is the point: the storage
 * wrapper has to degrade to memory rather than assume a browser, or the engine
 * suite could never import anything that touches persistence.
 */
beforeEach(() => {
  clearLocalState();
});

describe('tutorial state (FR-043, FR-046)', () => {
  it('FR-040: a first-time visitor is offered the tutorial', () => {
    expect(shouldOfferTutorial()).toBe(true);
    expect(readTutorialState()).toEqual({ dismissed: false, completed: false, lastStep: 0 });
  });

  it('FR-043: a dismissed tutorial is not offered again', () => {
    writeTutorialState({ dismissed: true });
    expect(shouldOfferTutorial()).toBe(false);
  });

  it('FR-043: a completed tutorial is not offered again', () => {
    writeTutorialState({ completed: true });
    expect(shouldOfferTutorial()).toBe(false);
  });

  it('FR-046: the last completed step round-trips', () => {
    writeTutorialState({ lastStep: 3 });
    expect(readTutorialState().lastStep).toBe(3);
  });

  it('FR-043: a write merges rather than replacing the whole record', () => {
    writeTutorialState({ lastStep: 3 });
    writeTutorialState({ dismissed: true });
    expect(readTutorialState()).toMatchObject({ dismissed: true, lastStep: 3 });
  });

  it('FR-046: state survives a simulated reload', () => {
    writeTutorialState({ dismissed: true, lastStep: 5 });
    // A reload re-reads from storage rather than from any module-level cache.
    expect(readTutorialState()).toMatchObject({ dismissed: true, lastStep: 5 });
  });
});

/**
 * Constitution Additional Constraints: reads of stored state must tolerate
 * absence, corruption, or a previous schema without crashing or blocking play.
 */
describe('tutorial state resilience (constitution: Data)', () => {
  it('tolerates malformed JSON by falling back to defaults', () => {
    rawWrite(TUTORIAL_KEY, '{not json at all');
    expect(() => readTutorialState()).not.toThrow();
    expect(readTutorialState()).toEqual({ dismissed: false, completed: false, lastStep: 0 });
  });

  it('tolerates a truncated write', () => {
    rawWrite(TUTORIAL_KEY, '{"dismissed":tr');
    expect(readTutorialState().dismissed).toBe(false);
  });

  it('tolerates JSON of the wrong shape', () => {
    rawWrite(TUTORIAL_KEY, '["dismissed"]');
    expect(readTutorialState()).toEqual({ dismissed: false, completed: false, lastStep: 0 });
  });

  it('tolerates fields of the wrong type', () => {
    rawWrite(TUTORIAL_KEY, '{"dismissed":"yes","lastStep":"three"}');
    const state = readTutorialState();
    expect(state.dismissed).toBe(false);
    expect(state.lastStep).toBe(0);
  });

  it('tolerates a record written by an unknown future schema', () => {
    rawWrite(TUTORIAL_KEY, '{"version":99,"dismissed":true,"somethingNew":42}');
    expect(() => readTutorialState()).not.toThrow();
    // An unknown version is discarded rather than half-trusted.
    expect(readTutorialState().dismissed).toBe(false);
  });

  it('recovers by overwriting corrupt state on the next write', () => {
    rawWrite(TUTORIAL_KEY, 'garbage');
    writeTutorialState({ dismissed: true });
    expect(readTutorialState().dismissed).toBe(true);
  });
});
