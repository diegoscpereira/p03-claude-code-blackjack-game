import { useState } from 'react';
import { LessonStep } from './LessonStep';
import { TutorialPanel } from './TutorialPanel';
import { LESSONS, isLastStep, lessonAt, nextStep, resumeStep } from './lessons';
import { useGameStore } from '../../store/gameStore';
import type { Action } from '../../engine/types';

/**
 * T058 — the guided-hand runner.
 *
 * Renders inside `TutorialPanel`, which supplies the dismiss control. That is
 * deliberate: FR-041 and SC-009 require a dismiss control on *every* tutorial
 * surface, and a runner that cannot render one cannot forget one.
 *
 * The tutorial never touches the live round. Its hands are scripted states, so
 * a player who leaves mid-lesson returns to exactly the table they left.
 */
export function TutorialRunner() {
  const tutorial = useGameStore((s) => s.tutorial);
  const setStep = useGameStore((s) => s.setTutorialStep);
  const complete = useGameStore((s) => s.completeTutorial);

  // FR-046: resume where the player left off, resolved once on mount.
  const [step, setLocalStep] = useState(() => resumeStep(tutorial));
  const [wrongAttempt, setWrongAttempt] = useState(false);

  const lesson = lessonAt(step);
  if (!lesson) return null;

  const advance = (): void => {
    if (isLastStep(step)) {
      // Record the final step before completing, so a resume after re-opening
      // does not land the player back on the last lesson.
      setStep(LESSONS.length);
      complete();
      return;
    }
    const next = nextStep(step);
    setLocalStep(next);
    setStep(next);
    setWrongAttempt(false);
  };

  const onAct = (action: Action): void => {
    if (lesson.hand && action !== lesson.hand.action) {
      setWrongAttempt(true);
      return;
    }
    advance();
  };

  return (
    <TutorialPanel>
      <LessonStep
        lesson={lesson}
        step={step}
        wrongAttempt={wrongAttempt}
        onAct={onAct}
        onContinue={advance}
      />
    </TutorialPanel>
  );
}
