import type { Action } from '../../engine/types';
import type { TutorialState } from './tutorialState';

/**
 * T057 — the lesson sequence (spec Assumption 6).
 *
 * A fixed linear sequence, not adaptive to performance: card values, hand
 * totals, soft versus hard, what the dealer must do, then each of the four
 * actions in turn.
 *
 * The guided hands carry the *action* they teach but no rationale text. The
 * reason shown to the player comes from the strategy module at render time, so
 * the tutorial cannot teach something the companion would contradict — the same
 * guarantee FR-051c makes of the unlockable guides.
 */

export interface GuidedHand {
  /** Player cards, in `hands.ts` shorthand. */
  readonly player: string;
  /** The dealer's upcard. */
  readonly dealer: string;
  /** The action this lesson gates on. Verified against `recommend()` in tests. */
  readonly action: Action;
}

export interface Lesson {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  /** Present on lessons that ask the player to act rather than to read. */
  readonly hand?: GuidedHand;
}

export const LESSONS: readonly Lesson[] = [
  {
    id: 'card-values',
    title: 'What the cards are worth',
    body:
      'Number cards are worth their number. Jacks, Queens and Kings are all worth ten. An Ace is worth either one or eleven — whichever helps you more, decided fresh every time you look at the hand.',
  },
  {
    id: 'hand-totals',
    title: 'Reading a total',
    body:
      'Your hand is worth the sum of its cards, and you are trying to finish closer to 21 than the dealer without going over. Going over 21 is a bust, and a bust loses immediately — even if the dealer busts afterwards.',
  },
  {
    id: 'soft-vs-hard',
    title: 'Soft totals and hard totals',
    body:
      'A hand holding an Ace counted as eleven is called soft: Ace and six is a soft 17. It is safe to draw to, because if the next card would bust you the Ace quietly drops to one instead. Once the Ace must count as one, the hand is hard, and the next card really can bust it.',
  },
  {
    id: 'dealer-rules',
    title: 'What the dealer must do',
    body:
      'The dealer has no choices at all. They draw until reaching 17 or more, and at this table they also draw on a soft 17. That is why a dealer showing a small card is in trouble: they must keep drawing, and they bust far more often.',
  },
  {
    id: 'hit',
    title: 'Hitting',
    body:
      'Hit takes one more card. With a low total against a strong dealer upcard you are losing if you stand, so you take the risk — not because hitting is safe, but because standing is worse.',
    hand: { player: '10,2', dealer: '10', action: 'hit' },
  },
  {
    id: 'stand',
    title: 'Standing',
    body:
      'Stand ends your turn and keeps your total. Against a weak dealer upcard you often do not need a good hand — you only need the dealer to bust, and they will do that on their own.',
    hand: { player: '10,8', dealer: '6', action: 'stand' },
  },
  {
    id: 'double',
    title: 'Doubling down',
    body:
      'Double doubles your bet, gives you exactly one more card, and ends your turn. It is the move for the spots where you are clearly ahead — a strong starting total against a weak dealer upcard.',
    hand: { player: '6,5', dealer: '6', action: 'double' },
  },
  {
    id: 'split',
    title: 'Splitting a pair',
    body:
      'Split turns a pair into two hands, each with its own bet and its own cards. Some pairs are much better as two hands than as one — and this is the most famous of them.',
    hand: { player: '8,8', dealer: '10', action: 'split' },
  },
];

export const LESSON_COUNT = LESSONS.length;

export function lessonAt(index: number): Lesson | null {
  return LESSONS[index] ?? null;
}

/** Advances one step, stopping at the last rather than running off the end. */
export function nextStep(index: number): number {
  return Math.min(index + 1, LESSON_COUNT - 1);
}

export function isLastStep(index: number): boolean {
  return index >= LESSON_COUNT - 1;
}

/**
 * T060 — FR-046: where re-entry resumes.
 *
 * `lastStep` counts *completed* steps, so it is also the index of the next one.
 * A finished tutorial restarts from the beginning: parking someone on the final
 * step with nothing left to do is not a resume, and re-opening the tutorial is
 * a request to be taught again.
 */
export function resumeStep(state: TutorialState): number {
  if (state.completed) return 0;
  if (state.lastStep < 0 || state.lastStep >= LESSON_COUNT) return 0;
  return state.lastStep;
}
