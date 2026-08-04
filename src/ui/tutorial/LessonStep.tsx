import { HandView } from '../table/Hand';
import { ACTION_LABELS } from '../table/actionReasons';
import { explain } from '../../strategy/explanations';
import { scriptedRound } from './scriptedRound';
import { LESSON_COUNT, type Lesson } from './lessons';
import type { Action } from '../../engine/types';

/**
 * T059 — one lesson step (FR-047).
 *
 * While a step is active the interface must highlight the action being taught
 * *and* state why it is correct. The reason is resolved from the same
 * explanation library the companion uses, so a lesson cannot drift out of
 * agreement with the live advice.
 */

const OFFERED: Exclude<Action, 'surrender'>[] = ['hit', 'stand', 'double', 'split'];

interface LessonStepProps {
  lesson: Lesson;
  step: number;
  wrongAttempt: boolean;
  onAct: (action: Action) => void;
  onContinue: () => void;
}

export function LessonStep({ lesson, step, wrongAttempt, onAct, onContinue }: LessonStepProps) {
  const round = lesson.hand ? scriptedRound(lesson.hand.player, lesson.hand.dealer) : null;
  const reason = round && lesson.hand ? explain(round, lesson.hand.action) : null;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-xs uppercase tracking-wide text-ink-muted" data-testid="lesson-progress">
          Step {step + 1} of {LESSON_COUNT}
        </p>
        <h3 className="mt-1 text-lg font-semibold text-ink" data-testid="lesson-title">
          {lesson.title}
        </h3>
      </div>

      <p className="text-sm leading-relaxed text-ink-muted" data-testid="lesson-body">
        {lesson.body}
      </p>

      {round && lesson.hand ? (
        <>
          <div className="flex flex-col gap-3">
            <HandView hand={round.dealerHand} label="Dealer" hideHoleCard />
            <HandView hand={round.playerHands[0]!} label="Your hand" isActive />
          </div>

          {reason && (
            <p className="text-sm leading-relaxed text-info" data-testid="lesson-reason">
              {reason}
            </p>
          )}

          <LessonActions taught={lesson.hand.action} onAct={onAct} />

          {wrongAttempt && (
            <p className="text-sm text-loss" data-testid="lesson-retry">
              Not this time — try the highlighted action. Nothing is at stake here.
            </p>
          )}
        </>
      ) : (
        <button
          type="button"
          data-testid="lesson-continue"
          onClick={onContinue}
          className="self-start rounded-lg bg-accent px-5 py-2 font-semibold text-ink-inverse"
        >
          Continue
        </button>
      )}
    </div>
  );
}

/**
 * The four actions, with the taught one highlighted. Every action stays
 * clickable: a beginner learns more from trying the wrong one and being told
 * why than from a control that refuses to respond.
 */
function LessonActions({ taught, onAct }: { taught: Action; onAct: (a: Action) => void }) {
  return (
    <div role="group" aria-label="Lesson actions" className="flex flex-wrap gap-2">
      {OFFERED.map((action) => {
        const isTaught = action === taught;
        return (
          <button
            key={action}
            type="button"
            data-testid={`lesson-action-${action}`}
            data-highlighted={isTaught}
            aria-describedby={isTaught ? 'lesson-reason' : undefined}
            onClick={() => onAct(action)}
            className={`min-w-24 rounded-lg px-4 py-2 font-semibold transition-colors ${
              isTaught
                ? 'bg-accent text-ink-inverse ring-2 ring-accent ring-offset-2 ring-offset-panel'
                : 'border border-border text-ink'
            }`}
          >
            {ACTION_LABELS[action]}
          </button>
        );
      })}
    </div>
  );
}
