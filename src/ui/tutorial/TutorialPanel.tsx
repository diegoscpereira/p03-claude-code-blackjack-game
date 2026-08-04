import type { ReactNode } from 'react';
import { useGameStore } from '../../store/gameStore';

/**
 * The frame every tutorial surface sits in.
 *
 * It exists so FR-041 and SC-009 are structural rather than remembered: any
 * lesson rendered as a child inherits a dismiss control that is present,
 * keyboard-reachable, and one interaction from the live table. A lesson cannot
 * forget to include one, because it never provides one.
 *
 * Phase 5 (T058) fills the body with the guided-hand runner.
 */
export function TutorialPanel({ children }: { children?: ReactNode }) {
  const tutorialOpen = useGameStore((s) => s.tutorialOpen);
  const dismiss = useGameStore((s) => s.dismissTutorial);

  if (!tutorialOpen) return null;

  return (
    <section
      data-testid="tutorial-panel"
      aria-label="Tutorial"
      className="mx-auto w-full max-w-4xl rounded-xl border border-accent bg-panel p-4"
    >
      <header className="mb-3 flex items-start justify-between gap-4">
        <h2 className="font-semibold text-accent">Tutorial</h2>
        <button
          type="button"
          data-testid="tutorial-dismiss"
          onClick={dismiss}
          className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-sm font-semibold text-ink"
        >
          Leave the tutorial
        </button>
      </header>

      {children ?? <p className="text-sm text-ink-muted">Loading the first lesson…</p>}
    </section>
  );
}
