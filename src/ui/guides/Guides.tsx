import { useState } from 'react';
import { useGameStore } from '../../store/gameStore';
import { ALL_UNLOCKS } from '../../progression/levels';
import type { UnlockId } from '../../progression/levels';
import { StrategyChart } from './StrategyChart';
import { PostGameAnalysis } from './PostGameAnalysis';
import { Chevron } from '../common/Chevron';
import { UNLOCK_FAMILY, UNLOCK_LABELS, levelFor } from './unlockLabels';

/**
 * T110 — the guides panel (FR-051a, FR-051b, FR-051c).
 *
 * A locked guide shows *that it exists* and the level that opens it, and
 * nothing else. That is FR-051b, and it is the more interesting half of the
 * requirement: hiding a locked guide entirely would remove the reason to keep
 * playing, while showing its contents would remove the reward for having done
 * so. The middle option is the one the spec asks for.
 */
export function Guides() {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<UnlockId>('post_game_analysis');
  const unlocks = useGameStore((s) => s.unlocks);

  const isUnlocked = (unlock: UnlockId): boolean => unlocks.includes(unlock);

  return (
    <section className="rounded-xl border border-border bg-panel px-4 py-3">
      <button
        type="button"
        data-testid="open-guides"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-2 text-sm font-semibold text-accent"
      >
        <Chevron expanded={open} />
        {open ? 'Hide guides' : 'Guides and analysis'}
      </button>

      {open && (
        <div className="mt-3 flex flex-col gap-3">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Guides">
            {ALL_UNLOCKS.map((unlock) => (
              <GuideTab
                key={unlock}
                unlock={unlock}
                unlocked={isUnlocked(unlock)}
                selected={selected === unlock}
                onSelect={() => setSelected(unlock)}
              />
            ))}
          </div>

          <GuideBody unlock={selected} unlocked={isUnlocked(selected)} />
        </div>
      )}
    </section>
  );
}

function GuideTab({
  unlock,
  unlocked,
  selected,
  onSelect,
}: {
  unlock: UnlockId;
  unlocked: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      data-testid={`guide-tab-${unlock}`}
      data-locked={!unlocked}
      onClick={onSelect}
      className={`rounded-lg border px-3 py-1.5 text-sm ${
        selected ? 'border-accent text-accent' : 'border-border text-ink'
      } ${unlocked ? '' : 'opacity-60'}`}
    >
      {/* FR-051b: a locked guide is named and its level stated. Naming it is
          the point — an invisible reward motivates nobody. */}
      {UNLOCK_LABELS[unlock]}
      {!unlocked && <span className="ml-2 text-xs text-ink-muted">level {levelFor(unlock)}</span>}
    </button>
  );
}

function GuideBody({ unlock, unlocked }: { unlock: UnlockId; unlocked: boolean }) {
  if (!unlocked) {
    return (
      <p data-testid="guide-locked" className="text-sm text-ink-muted">
        Reach level {levelFor(unlock)} to unlock {UNLOCK_LABELS[unlock]}.
      </p>
    );
  }

  const family = UNLOCK_FAMILY[unlock];
  return family === null ? <PostGameAnalysis /> : <StrategyChart family={family} />;
}
