import { describe, expect, it } from 'vitest';
import { explain, explanationKey } from '../../../src/strategy/explanations';
import { recommend } from '../../../src/strategy/ev';
import { PHASE_1_RULES } from '../../../src/engine/rules-config';
import { REFERENCE_CHART } from '../../fixtures/basic-strategy';
import { cardsForShape, hand, round } from '../../helpers/hands';

/**
 * T065 — FR-028, FR-029, SC-010: 100% coverage of charted decision points, and
 * the same input always resolving to the same text.
 * T066 — FR-027: an unmatched key returns null, never placeholder text.
 */
const rules = PHASE_1_RULES;

const at = (player: string, dealer: string) =>
  round({
    playerHands: [hand(player)],
    dealerHand: hand(`${dealer},7`, { id: 'dealer' }),
  });

// hard-4 and soft-12 exist only as pair fallbacks — no hand classifies as
// either, so neither is a decision point that needs its own explanation.
const charted = REFERENCE_CHART.filter(
  (e) => !(e.kind === 'hard' && e.value === 4) && !(e.kind === 'soft' && e.value === 12),
);

describe('explanation coverage (FR-028, SC-010)', () => {
  it('SC-010: every charted decision point resolves to an explanation', () => {
    const missing: string[] = [];
    for (const entry of charted) {
      const state = at(cardsForShape(entry.shape), entry.dealerUpcard);
      if (explain(state, recommend(state, rules)!) === null) {
        missing.push(`${entry.shape} vs ${entry.dealerUpcard}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('FR-023: the explanation names the player total and the dealer upcard', () => {
    const state = at('10,6', '10');
    const text = explain(state, recommend(state, rules)!);
    expect(text).toContain('16');
    expect(text).toContain('10');
  });

  it('FR-023: a soft hand is described as soft', () => {
    const state = at('A,7', '9');
    expect(explain(state, recommend(state, rules)!)?.toLowerCase()).toContain('soft');
  });

  it('FR-028: no explanation is empty or whitespace', () => {
    for (const entry of charted) {
      const state = at(cardsForShape(entry.shape), entry.dealerUpcard);
      const text = explain(state, recommend(state, rules)!);
      expect(text?.trim().length ?? 0).toBeGreaterThan(20);
    }
  });
});

describe('explanation determinism (FR-029)', () => {
  it('FR-029: the same shape, upcard and action always give the same text', () => {
    for (let i = 0; i < 5; i++) {
      expect(explain(at('10,6', '10'), 'hit')).toBe(explain(at('10,6', '10'), 'hit'));
    }
  });

  it('FR-029: the key ignores everything that must not affect the text', () => {
    // Same shape, different suits and different card order.
    expect(explanationKey(at('10,6', '10'), 'hit')).toBe(explanationKey(at('6,10', '10'), 'hit'));
  });

  it('FR-029: different actions on the same hand give different text', () => {
    const state = at('10,6', '10');
    expect(explain(state, 'hit')).not.toBe(explain(state, 'stand'));
  });
});

describe('missing entries degrade cleanly (FR-027)', () => {
  it('FR-027: an unmatched key returns null rather than placeholder text', () => {
    // Surrender is never charted in Phase 1, so it has no library entry.
    expect(explain(at('10,6', '10'), 'surrender')).toBeNull();
  });

  it('FR-027: null is returned, not an empty string', () => {
    const result = explain(at('10,6', '10'), 'surrender');
    expect(result).not.toBe('');
    expect(result).toBeNull();
  });

  it('FR-027: a state with no active hand explains nothing', () => {
    expect(explain(round({ playerHands: [] }), 'hit')).toBeNull();
  });

  it('FR-027: a state with no dealer upcard explains nothing', () => {
    const noUpcard = round({ dealerHand: hand('', { id: 'dealer' }) });
    expect(explain(noUpcard, 'hit')).toBeNull();
  });

  it('FR-027: no entry contains placeholder markers', () => {
    for (const entry of charted) {
      const state = at(cardsForShape(entry.shape), entry.dealerUpcard);
      const text = explain(state, recommend(state, rules)!) ?? '';
      expect(text).not.toMatch(/TODO|TBD|\{\{|lorem/i);
    }
  });
});
