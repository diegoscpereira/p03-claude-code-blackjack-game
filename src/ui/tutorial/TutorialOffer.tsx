import { useGameStore } from '../../store/gameStore';

/**
 * T050 — the tutorial offer (FR-040, FR-041, FR-042).
 *
 * A banner above the table, not a modal. Constitution Principle III forbids
 * interrupting a hand with a modal, and User Story 2 is explicit that a
 * tutorial which cannot be escaped is the fastest way to lose an experienced
 * player. So: no overlay, no focus trap, no confirmation, and the dismiss
 * control sits in the first viewport rather than below the fold.
 */
export function TutorialOffer() {
  const tutorial = useGameStore((s) => s.tutorial);
  const tutorialOpen = useGameStore((s) => s.tutorialOpen);
  const dismiss = useGameStore((s) => s.dismissTutorial);
  const open = useGameStore((s) => s.openTutorial);

  // FR-043: dismissed or completed means never offered again on this device.
  if (tutorial.dismissed || tutorial.completed || tutorialOpen) return null;

  return (
    <section
      data-testid="tutorial-offer"
      aria-label="Tutorial offer"
      className="mx-auto flex w-full max-w-4xl flex-wrap items-center justify-between gap-3 rounded-xl border border-accent bg-panel px-4 py-3"
    >
      <div>
        <h2 className="font-semibold text-accent">New to Blackjack?</h2>
        <p className="text-sm text-ink-muted">
          A short guided walkthrough covers card values, soft and hard totals, and the four
          actions. You can leave at any point.
        </p>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          data-testid="tutorial-accept"
          onClick={open}
          className="rounded-lg bg-accent px-4 py-2 font-semibold text-ink-inverse"
        >
          Show me
        </button>
        <button
          type="button"
          data-testid="tutorial-dismiss"
          onClick={dismiss}
          className="rounded-lg border border-border px-4 py-2 font-semibold text-ink"
        >
          No thanks, deal me in
        </button>
      </div>
    </section>
  );
}
