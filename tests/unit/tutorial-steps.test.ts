import { describe, expect, it } from 'vitest';
import {
  LESSONS,
  LESSON_COUNT,
  isLastStep,
  lessonAt,
  nextStep,
  resumeStep,
} from '../../src/ui/tutorial/lessons';
import { scriptedRound } from '../../src/ui/tutorial/scriptedRound';
import { recommend } from '../../src/strategy/ev';
import { explain } from '../../src/strategy/explanations';
import { PHASE_1_RULES } from '../../src/engine/rules-config';

/**
 * T054 — lesson sequencing and step advancement.
 *
 * The tutorial is a fixed linear sequence, not adaptive (spec Assumption 6), so
 * its ordering is data and can be tested as data.
 */
const rules = PHASE_1_RULES;

describe('the lesson sequence (spec Assumption 6)', () => {
  it('covers the syllabus the spec names, in order', () => {
    // Card values, hand totals, soft versus hard, dealer rules, then each of
    // the four actions (User Story 3).
    expect(LESSONS.map((lesson) => lesson.id)).toEqual([
      'card-values',
      'hand-totals',
      'soft-vs-hard',
      'dealer-rules',
      'hit',
      'stand',
      'double',
      'split',
    ]);
  });

  it('teaches each of the four actions with a guided hand', () => {
    const guided = LESSONS.filter((lesson) => lesson.hand);
    expect(guided.map((lesson) => lesson.hand!.action)).toEqual([
      'hit',
      'stand',
      'double',
      'split',
    ]);
  });

  it('gives every lesson a title and a body worth reading', () => {
    for (const lesson of LESSONS) {
      expect(lesson.title.length).toBeGreaterThan(3);
      expect(lesson.body.length).toBeGreaterThan(40);
    }
  });

  it('uses unique ids', () => {
    expect(new Set(LESSONS.map((l) => l.id)).size).toBe(LESSON_COUNT);
  });
});

describe('step advancement (FR-046)', () => {
  it('advances one step at a time', () => {
    expect(nextStep(0)).toBe(1);
    expect(nextStep(3)).toBe(4);
  });

  it('does not advance past the final step', () => {
    expect(nextStep(LESSON_COUNT - 1)).toBe(LESSON_COUNT - 1);
  });

  it('knows which step is last', () => {
    expect(isLastStep(LESSON_COUNT - 1)).toBe(true);
    expect(isLastStep(0)).toBe(false);
  });

  it('returns null rather than throwing for an out-of-range step', () => {
    expect(lessonAt(-1)).toBeNull();
    expect(lessonAt(LESSON_COUNT)).toBeNull();
    expect(lessonAt(0)).toBe(LESSONS[0]);
  });
});

describe('resuming (FR-046)', () => {
  it('FR-046: resumes at the step after the last completed one', () => {
    // Spec Gherkin: three of eight steps completed resumes at step four.
    expect(resumeStep({ dismissed: false, completed: false, lastStep: 3 })).toBe(3);
  });

  it('FR-046: a fresh player starts at the beginning', () => {
    expect(resumeStep({ dismissed: false, completed: false, lastStep: 0 })).toBe(0);
  });

  it('FR-046: a completed tutorial restarts from the beginning', () => {
    // Re-opening a finished tutorial should teach it again, not park on the
    // final step with nowhere to go.
    expect(resumeStep({ dismissed: false, completed: true, lastStep: 8 })).toBe(0);
  });

  it('clamps a stored step beyond the end of the sequence', () => {
    expect(resumeStep({ dismissed: false, completed: false, lastStep: 99 })).toBe(0);
  });
});

/**
 * The tutorial must not teach anything the companion would contradict — the
 * same requirement FR-051c makes of the unlockable guides. Deriving the taught
 * action from the same strategy module is what makes that structural.
 */
describe('lessons agree with the strategy module (FR-051c)', () => {
  const guided = LESSONS.filter((lesson) => lesson.hand);

  it.each(guided.map((l) => [l.id, l.hand!.player, l.hand!.dealer, l.hand!.action] as const))(
    'the %s lesson teaches the action the companion recommends',
    (_id, player, dealer, action) => {
      const round = scriptedRound(player, dealer);
      expect(recommend(round, rules)).toBe(action);
    },
  );

  it.each(guided.map((l) => [l.id, l.hand!.player, l.hand!.dealer] as const))(
    'the %s lesson has an explanation to show (FR-047)',
    (_id, player, dealer) => {
      const round = scriptedRound(player, dealer);
      const text = explain(round, recommend(round, rules)!);
      expect(text?.length ?? 0).toBeGreaterThan(20);
    },
  );
});

describe('scriptedRound (T058)', () => {
  it('deals exactly the cards the lesson asks for', () => {
    const round = scriptedRound('8,8', '10');
    expect(round.playerHands[0]!.cards.map((c) => c.rank)).toEqual(['8', '8']);
    expect(round.dealerHand.cards[0]!.rank).toBe('10');
  });

  it('starts in the player phase with a hole card still hidden', () => {
    const round = scriptedRound('10,2', '10');
    expect(round.phase).toBe('player');
    expect(round.dealerHoleCardRevealed).toBe(false);
    expect(round.dealerHand.cards).toHaveLength(2);
  });

  it('leaves enough bankroll for doubling and splitting to be legal', () => {
    const round = scriptedRound('8,8', '10');
    expect(round.availableBankroll).toBeGreaterThanOrEqual(round.playerHands[0]!.bet);
  });

  it('is deterministic — the same lesson always deals the same hand', () => {
    expect(scriptedRound('6,5', '6')).toEqual(scriptedRound('6,5', '6'));
  });
});
