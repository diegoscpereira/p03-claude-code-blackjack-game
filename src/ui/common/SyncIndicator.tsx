import { useGameStore } from '../../store/gameStore';

/**
 * T108 — FR-063: the sync indicator.
 *
 * Everything about this component is a decision *not* to interrupt. It is not a
 * modal, it takes no focus, it disables nothing, and it offers no "retry" the
 * player would have to think about — the outbox is already retrying. A failed
 * sync is not a problem the player can help with, so presenting it as one would
 * only transfer anxiety without transferring agency.
 *
 * Constitution Principle III: no modal may interrupt a hand in progress.
 */
export function SyncIndicator() {
  const pending = useGameStore((s) => s.pendingSync);
  if (pending === 0) return null;

  return (
    <p
      data-testid="sync-indicator"
      role="status"
      aria-live="polite"
      className="flex items-center gap-2 text-xs text-ink-muted"
    >
      <span aria-hidden="true" className="h-2 w-2 rounded-full bg-ink-muted" />
      {pending} result{pending === 1 ? '' : 's'} waiting to sync
    </p>
  );
}
