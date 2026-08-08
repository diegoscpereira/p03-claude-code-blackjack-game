import { useGameStore } from '../../store/gameStore';
import { UNLOCK_LABELS } from '../guides/unlockLabels';

/**
 * T109 — FR-051: the level-up announcement.
 *
 * A banner rather than a dialog, for the same reason as the sync indicator:
 * Principle III forbids a modal during a hand, and levelling up happens exactly
 * when a hand settles. The unlock it names is already granted by the time this
 * renders — the store applied it optimistically — so there is nothing to
 * confirm and no reload to prompt for.
 */
export function LevelUp() {
  const announcement = useGameStore((s) => s.levelUp);
  const dismiss = useGameStore((s) => s.dismissLevelUp);

  if (!announcement) return null;

  return (
    <div
      data-testid="level-up"
      role="status"
      aria-live="polite"
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent bg-panel px-4 py-3"
    >
      <p className="text-sm text-ink">
        <span className="font-semibold text-accent">Level {announcement.level}</span>
        {announcement.unlocks.length > 0 && (
          <>
            {' — unlocked '}
            {announcement.unlocks.map((unlock) => UNLOCK_LABELS[unlock]).join(' and ')}
          </>
        )}
      </p>

      <button
        type="button"
        data-testid="dismiss-level-up"
        onClick={dismiss}
        className="rounded-lg border border-border px-3 py-1.5 text-sm font-semibold text-ink"
      >
        Got it
      </button>
    </div>
  );
}
