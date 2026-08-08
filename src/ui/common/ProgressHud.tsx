import { useGameStore } from '../../store/gameStore';
import { MAX_LEVEL, xpToNextLevel } from '../../progression/levels';
import { formatEvAccuracy } from '../../progression/accuracy';
import { SyncIndicator } from './SyncIndicator';

/**
 * Lifetime progression, on screen rather than behind a menu (FR-052).
 *
 * Board state under Principle III is about the *hand*; this is about the
 * player, and it sits alongside rather than inside the felt. The sync indicator
 * lives here too, because "waiting to sync" is a statement about progression
 * and not about the round in play.
 */
export function ProgressHud() {
  const level = useGameStore((s) => s.level);
  const xp = useGameStore((s) => s.xp);
  const handsPlayed = useGameStore((s) => s.handsPlayed);
  const wins = useGameStore((s) => s.wins);
  const losses = useGameStore((s) => s.losses);
  const pushes = useGameStore((s) => s.pushes);
  const taken = useGameStore((s) => s.decisionsTaken);
  const matched = useGameStore((s) => s.decisionsMatched);

  const remaining = xpToNextLevel(xp);

  return (
    <section
      aria-label="Progression"
      className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-border bg-panel px-4 py-3 text-sm"
    >
      <Stat label="Level" value={String(level)} testId="level" />
      <Stat label="XP" value={String(xp)} testId="xp" />
      {/* FR-024b: an em dash until a decision exists — never a misleading 0%. */}
      <Stat label="EV accuracy" value={formatEvAccuracy(taken, matched)} testId="ev-accuracy" />
      <Stat
        label="Record"
        value={`${wins}W · ${losses}L · ${pushes}P`}
        testId="lifetime-record"
      />
      <Stat label="Hands" value={String(handsPlayed)} testId="hands-played" />

      <p className="text-xs text-ink-muted" data-testid="next-level">
        {/* FR-051e: level 10 is a completed ladder, not a pending eleventh. */}
        {remaining === null ? `Level ${MAX_LEVEL} — ladder complete` : `${remaining} XP to level ${level + 1}`}
      </p>

      <SyncIndicator />
    </section>
  );
}

function Stat({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <p className="flex flex-col">
      <span className="text-xs uppercase tracking-wide text-ink-muted">{label}</span>
      <span className="font-semibold tabular-nums text-ink" data-testid={testId}>
        {value}
      </span>
    </p>
  );
}
