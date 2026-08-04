import { useState } from 'react';
import { useGameStore } from '../../store/gameStore';

/**
 * T052 — the help menu (FR-044).
 *
 * The tutorial is dismissible for good, so it needs a permanent way back in.
 * Without this, FR-043's "never offer it again" would quietly become "you can
 * never see it again", which is a different and worse product.
 */
export function HelpMenu() {
  const [open, setOpen] = useState(false);
  const openTutorial = useGameStore((s) => s.openTutorial);
  const tutorial = useGameStore((s) => s.tutorial);

  const resumes = tutorial.lastStep > 0 && !tutorial.completed;

  return (
    <div className="relative">
      <button
        type="button"
        data-testid="help-menu-toggle"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
        className="rounded-lg border border-border px-3 py-1.5 text-sm font-semibold text-ink"
      >
        Help
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-10 mt-2 w-56 rounded-lg border border-border bg-panel p-2 shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            data-testid="help-open-tutorial"
            onClick={() => {
              openTutorial();
              setOpen(false);
            }}
            className="w-full rounded px-3 py-2 text-left text-sm text-ink hover:bg-felt"
          >
            {resumes ? `Resume tutorial (step ${tutorial.lastStep + 1})` : 'Open the tutorial'}
          </button>

          <CompanionToggle />
        </div>
      )}
    </div>
  );
}

/**
 * T077 — FR-026: hides the advice during play while still recording whether
 * each decision matched, so the post-game analysis stays complete and the
 * accuracy score cannot be inflated by simply turning the companion off.
 */
function CompanionToggle() {
  const enabled = useGameStore((s) => s.companionEnabled);
  const setEnabled = useGameStore((s) => s.setCompanionEnabled);

  return (
    <label className="flex cursor-pointer items-center gap-2 rounded px-3 py-2 text-sm text-ink hover:bg-felt">
      <input
        type="checkbox"
        data-testid="companion-toggle"
        checked={enabled}
        onChange={(event) => setEnabled(event.target.checked)}
        className="h-4 w-4 accent-accent"
      />
      Show strategy advice
    </label>
  );
}
