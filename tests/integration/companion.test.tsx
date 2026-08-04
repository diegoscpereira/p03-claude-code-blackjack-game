import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CompanionPanel } from '../../src/ui/companion/CompanionPanel';
import { Table } from '../../src/ui/table/Table';
import { useGameStore } from '../../src/store/gameStore';
import { clearLocalState } from '../../src/sync/storage';
import { hand, round, stackedShoe } from '../helpers/hands';

/**
 * T067 — FR-025: a non-recommended action proceeds without blocking, and the
 * player is shown what was recommended and the EV difference.
 *
 * The requirement's teeth are in "without blocking play or requiring
 * acknowledgement". A companion that interrupts to correct you is a worse
 * product than one that says nothing, so the absence of a dialog is asserted
 * as firmly as the presence of the advice.
 */
beforeEach(() => {
  clearLocalState();
  useGameStore.getState().reset();
  useGameStore.getState().dismissTutorial();
});

/** A seed that deals a hand where hitting and standing differ in EV. */
const SEED = 20260804;

describe('CompanionPanel (FR-022)', () => {
  it('FR-022: lists every legal action with its expected value', () => {
    useGameStore.getState().deal(SEED);
    useGameStore.getState().collapseBotTurns();
    render(<CompanionPanel />);

    const rows = screen.getAllByTestId(/^companion-action-/);
    expect(rows.length).toBeGreaterThanOrEqual(2);
    for (const row of rows) {
      expect(row.textContent).toMatch(/-?\d\.\d\d/);
    }
  });

  it('FR-022: marks exactly one action as recommended', () => {
    useGameStore.getState().deal(SEED);
    useGameStore.getState().collapseBotTurns();
    render(<CompanionPanel />);
    expect(screen.getAllByTestId('companion-recommended')).toHaveLength(1);
  });

  it('FR-023: shows a plain-language explanation alongside the recommendation', () => {
    useGameStore.getState().deal(SEED);
    useGameStore.getState().collapseBotTurns();
    render(<CompanionPanel />);
    expect(screen.getByTestId('companion-explanation').textContent?.length).toBeGreaterThan(20);
  });

  it('FR-026: records match data but shows no advice when disabled', () => {
    useGameStore.getState().deal(SEED);
    useGameStore.getState().collapseBotTurns();
    useGameStore.getState().setCompanionEnabled(false);
    render(<CompanionPanel />);

    expect(screen.queryByTestId('companion-explanation')).not.toBeInTheDocument();
    expect(screen.queryAllByTestId(/^companion-action-/)).toHaveLength(0);
  });

  it('shows nothing when there is no decision to advise on', () => {
    const { container } = render(<CompanionPanel />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('acting against the recommendation (FR-024, FR-025)', () => {
  /** Takes whichever legal action the companion did *not* recommend. */
  function actAgainstAdvice(): { chosen: string; recommended: string } {
    const store = useGameStore.getState();
    const recommended = store.recommendation()!;
    const chosen = store.legalActions().find((action) => action !== recommended)!;
    store.act(chosen);
    return { chosen, recommended };
  }

  it('FR-024: records the decision with its recommendation and match flag', () => {
    useGameStore.getState().deal(SEED);
    useGameStore.getState().collapseBotTurns();
    const { chosen, recommended } = actAgainstAdvice();

    const decision = useGameStore.getState().lastDecision!;
    expect(decision.chosen).toBe(chosen);
    expect(decision.recommended).toBe(recommended);
    expect(decision.matched).toBe(false);
  });

  it('FR-024: records a matching decision as matched', () => {
    useGameStore.getState().deal(SEED);
    useGameStore.getState().collapseBotTurns();
    const store = useGameStore.getState();
    store.act(store.recommendation()!);
    expect(useGameStore.getState().lastDecision!.matched).toBe(true);
  });

  it('FR-025: the action is carried out without interruption', async () => {
    useGameStore.getState().deal(SEED);
    useGameStore.getState().collapseBotTurns();
    render(<Table />);

    const before = useGameStore.getState().round;
    actAgainstAdvice();
    expect(useGameStore.getState().round).not.toBe(before);

    // No modal, no acknowledgement (Principle III).
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('FR-025: shows the recommendation and the EV difference afterwards', () => {
    useGameStore.getState().deal(SEED);
    useGameStore.getState().collapseBotTurns();
    actAgainstAdvice();
    render(<CompanionPanel />);

    const feedback = screen.getByTestId('companion-feedback');
    expect(feedback.textContent).toMatch(/recommended/i);
    expect(feedback.textContent).toMatch(/\d\.\d\d/);
  });

  it('FR-025: says nothing after a decision that matched', () => {
    useGameStore.getState().deal(SEED);
    useGameStore.getState().collapseBotTurns();
    const store = useGameStore.getState();
    store.act(store.recommendation()!);
    render(<CompanionPanel />);

    expect(screen.queryByTestId('companion-feedback')).not.toBeInTheDocument();
  });

  it('FR-024a: the forced split-Ace stand records no decision', () => {
    // Constructed rather than hunted for by seed: a pair of Aces turns up in
    // well under 1% of deals, and the shoe carries between rounds, so sampling
    // seeds would be both slow and unsound.
    useGameStore.setState({
      round: round({ playerHands: [hand('A,A')], shoe: stackedShoe('9,K') }),
    });

    const before = useGameStore.getState().decisionsTaken;
    useGameStore.getState().act('split');

    // Splitting is one decision the player made. The two stands that follow are
    // forced by FR-011, so they add nothing to the accuracy denominator.
    expect(useGameStore.getState().decisionsTaken).toBe(before + 1);
    expect(useGameStore.getState().round!.decisions).toHaveLength(0);
  });

  it('FR-026: decisions are still recorded while the companion is hidden', async () => {
    const user = userEvent.setup();
    useGameStore.getState().setCompanionEnabled(false);
    useGameStore.getState().deal(SEED);
    useGameStore.getState().collapseBotTurns();
    render(<Table />);

    await user.click(screen.getByTestId('action-stand'));
    expect(useGameStore.getState().decisionsTaken).toBe(1);
  });
});
