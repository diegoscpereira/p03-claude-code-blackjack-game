import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TutorialRunner } from '../../src/ui/tutorial/TutorialRunner';
import { useGameStore } from '../../src/store/gameStore';
import { clearLocalState } from '../../src/sync/storage';
import { LESSONS, LESSON_COUNT } from '../../src/ui/tutorial/lessons';

/**
 * T055 — FR-047: while a lesson step is active, the interface highlights the
 * action the step teaches and states why it is correct.
 */
beforeEach(() => {
  clearLocalState();
  useGameStore.getState().reset();
  useGameStore.getState().openTutorial();
});

/** Index of the first lesson that gates on an action. */
const FIRST_GUIDED = LESSONS.findIndex((lesson) => lesson.hand);

describe('LessonStep (FR-047)', () => {
  it('shows the current lesson title and body', () => {
    render(<TutorialRunner />);
    expect(screen.getByTestId('lesson-title')).toHaveTextContent(LESSONS[0]!.title);
    expect(screen.getByTestId('lesson-body').textContent!.length).toBeGreaterThan(40);
  });

  it('FR-047: highlights the action the step teaches', async () => {
    useGameStore.getState().setTutorialStep(FIRST_GUIDED);
    render(<TutorialRunner />);

    const taught = LESSONS[FIRST_GUIDED]!.hand!.action;
    expect(screen.getByTestId(`lesson-action-${taught}`)).toHaveAttribute(
      'data-highlighted',
      'true',
    );
  });

  it('FR-047: states why the taught action is correct', () => {
    useGameStore.getState().setTutorialStep(FIRST_GUIDED);
    render(<TutorialRunner />);
    expect(screen.getByTestId('lesson-reason').textContent!.length).toBeGreaterThan(20);
  });

  it('FR-047: deals the predetermined hand for the lesson', () => {
    useGameStore.getState().setTutorialStep(FIRST_GUIDED);
    render(<TutorialRunner />);

    const expected = LESSONS[FIRST_GUIDED]!.hand!.player.split(',');
    expect(screen.getAllByTestId('card').length).toBeGreaterThanOrEqual(expected.length);
  });

  it('gates the step on the taught action — a wrong action does not advance', async () => {
    const user = userEvent.setup();
    useGameStore.getState().setTutorialStep(FIRST_GUIDED);
    render(<TutorialRunner />);

    const taught = LESSONS[FIRST_GUIDED]!.hand!.action;
    const wrong = taught === 'hit' ? 'stand' : 'hit';

    await user.click(screen.getByTestId(`lesson-action-${wrong}`));
    expect(screen.getByTestId('lesson-title')).toHaveTextContent(LESSONS[FIRST_GUIDED]!.title);
    expect(screen.getByTestId('lesson-retry')).toBeInTheDocument();
  });

  it('advances when the taught action is taken', async () => {
    const user = userEvent.setup();
    useGameStore.getState().setTutorialStep(FIRST_GUIDED);
    render(<TutorialRunner />);

    const taught = LESSONS[FIRST_GUIDED]!.hand!.action;
    await user.click(screen.getByTestId(`lesson-action-${taught}`));

    expect(screen.getByTestId('lesson-title')).toHaveTextContent(LESSONS[FIRST_GUIDED + 1]!.title);
  });

  it('advances an explanatory step with Continue', async () => {
    const user = userEvent.setup();
    render(<TutorialRunner />);

    await user.click(screen.getByTestId('lesson-continue'));
    expect(screen.getByTestId('lesson-title')).toHaveTextContent(LESSONS[1]!.title);
  });

  it('FR-046: records progress as steps are completed', async () => {
    const user = userEvent.setup();
    render(<TutorialRunner />);

    await user.click(screen.getByTestId('lesson-continue'));
    expect(useGameStore.getState().tutorial.lastStep).toBe(1);
  });

  it('shows how far through the sequence the player is', () => {
    render(<TutorialRunner />);
    expect(screen.getByTestId('lesson-progress')).toHaveTextContent(`1 of ${LESSON_COUNT}`);
  });

  it('marks the tutorial complete after the final step', async () => {
    const user = userEvent.setup();
    useGameStore.getState().setTutorialStep(LESSON_COUNT - 1);
    render(<TutorialRunner />);

    const last = LESSONS[LESSON_COUNT - 1]!;
    await user.click(screen.getByTestId(`lesson-action-${last.hand!.action}`));

    expect(useGameStore.getState().tutorial.completed).toBe(true);
    expect(useGameStore.getState().tutorialOpen).toBe(false);
  });

  it('SC-009: every lesson step keeps a dismiss control one interaction away', async () => {
    const user = userEvent.setup();
    for (let step = 0; step < LESSON_COUNT; step++) {
      useGameStore.getState().reset();
      useGameStore.getState().openTutorial();
      useGameStore.getState().setTutorialStep(step);

      const { unmount } = render(<TutorialRunner />);
      expect(screen.getByTestId('tutorial-dismiss')).toBeInTheDocument();

      await user.click(screen.getByTestId('tutorial-dismiss'));
      expect(useGameStore.getState().tutorialOpen).toBe(false);
      unmount();
    }
  });
});
