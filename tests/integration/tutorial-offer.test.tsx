import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TutorialOffer } from '../../src/ui/tutorial/TutorialOffer';
import { useGameStore } from '../../src/store/gameStore';
import { clearLocalState } from '../../src/sync/storage';

/**
 * T047 — FR-041, FR-042: the dismiss control is present, keyboard-reachable,
 * and takes no confirmation.
 *
 * This is the control that decides whether Alex stays or leaves, so it gets a
 * test rather than a design review.
 */
beforeEach(() => {
  clearLocalState();
  useGameStore.getState().reset();
});

describe('TutorialOffer (FR-040, FR-041, FR-042)', () => {
  it('FR-040: is shown to a first-time visitor', () => {
    render(<TutorialOffer />);
    expect(screen.getByTestId('tutorial-offer')).toBeInTheDocument();
  });

  it('FR-041: presents a dismiss control', () => {
    render(<TutorialOffer />);
    expect(screen.getByTestId('tutorial-dismiss')).toBeInTheDocument();
  });

  it('FR-041: the dismiss control is reachable by keyboard', async () => {
    const user = userEvent.setup();
    render(<TutorialOffer />);

    await user.tab();
    await user.tab();
    // Both controls are natively focusable buttons, so tabbing reaches dismiss
    // without a tabindex trick.
    expect(screen.getByTestId('tutorial-dismiss')).toHaveFocus();
  });

  it('FR-042: dismissing takes one interaction and no confirmation', async () => {
    const user = userEvent.setup();
    const { container } = render(<TutorialOffer />);

    await user.click(screen.getByTestId('tutorial-dismiss'));

    expect(useGameStore.getState().tutorial.dismissed).toBe(true);
    // No intermediate screen: the offer is simply gone.
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('FR-042: dismissing by keyboard alone works identically', async () => {
    const user = userEvent.setup();
    render(<TutorialOffer />);

    screen.getByTestId('tutorial-dismiss').focus();
    await user.keyboard('{Enter}');

    expect(useGameStore.getState().tutorial.dismissed).toBe(true);
  });

  it('FR-043: is not shown once dismissed', () => {
    useGameStore.getState().dismissTutorial();
    const { container } = render(<TutorialOffer />);
    expect(container).toBeEmptyDOMElement();
  });

  it('FR-043: is not shown once completed', () => {
    useGameStore.getState().completeTutorial();
    const { container } = render(<TutorialOffer />);
    expect(container).toBeEmptyDOMElement();
  });

  it('FR-042: dismissal is persisted immediately, not on unmount', async () => {
    const user = userEvent.setup();
    render(<TutorialOffer />);
    await user.click(screen.getByTestId('tutorial-dismiss'));

    expect(localStorage.getItem('bj.tutorial')).toContain('"dismissed":true');
  });

  it('FR-045: accepting the tutorial does not gate anything — it only opens it', async () => {
    const user = userEvent.setup();
    render(<TutorialOffer />);
    await user.click(screen.getByTestId('tutorial-accept'));

    expect(useGameStore.getState().tutorialOpen).toBe(true);
    expect(useGameStore.getState().tutorial.dismissed).toBe(false);
  });

  it('Principle III: the offer never blocks the table behind a modal', () => {
    render(<TutorialOffer />);
    const offer = screen.getByTestId('tutorial-offer');
    expect(offer).not.toHaveAttribute('role', 'dialog');
    expect(offer).not.toHaveAttribute('aria-modal', 'true');
  });

  it('SC-002: dismissal costs exactly one interaction', async () => {
    const user = userEvent.setup();
    const clicks = vi.fn();
    render(<TutorialOffer />);

    document.addEventListener('click', clicks);
    await user.click(screen.getByTestId('tutorial-dismiss'));
    document.removeEventListener('click', clicks);

    expect(clicks).toHaveBeenCalledTimes(1);
    expect(useGameStore.getState().tutorial.dismissed).toBe(true);
  });
});
