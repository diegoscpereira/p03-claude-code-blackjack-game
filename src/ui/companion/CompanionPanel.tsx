import { useEffect, useState } from 'react';
import { Explanation } from './Explanation';
import { ACTION_LABELS } from '../table/actionReasons';
import { useGameStore } from '../../store/gameStore';
import type { Action } from '../../engine/types';
import type { RankedAction } from '../../strategy/ev';

/**
 * T074 — the companion panel (FR-022, FR-022a, FR-025, FR-026).
 *
 * Every legal action with its expected value, the top one marked. Note what is
 * absent: there is no dialog, no confirmation, and no way for this panel to
 * refuse an action. FR-025 requires a non-recommended choice to proceed without
 * blocking, so the feedback appears *after* the fact and asks nothing of the
 * player.
 *
 * FR-022a: the ranking sits behind a disclosure, collapsed at the start of every
 * round. A trainer that answers before you have thought is not teaching — the
 * click is the pause in which the player forms their own view. The feedback
 * below is deliberately *outside* the disclosure: it is the half of the loop
 * that arrives after the decision is committed, and it should cost no click.
 */
export function CompanionPanel() {
  const round = useGameStore((s) => s.round);
  const enabled = useGameStore((s) => s.companionEnabled);
  const ranked = useGameStore((s) => s.rankedActions());
  const decision = useGameStore((s) => s.lastDecision);
  const seed = useGameStore((s) => s.round?.seed ?? null);

  // Held here rather than in the store: it is view state with a round-long life,
  // and persisting it would defeat the point — expanded once would mean expanded
  // for every hand after, which is the behaviour this replaces.
  const [expanded, setExpanded] = useState(false);
  useEffect(() => setExpanded(false), [seed]);

  if (!round || !enabled) return null;

  // The feedback has to outlive the decision point. An action that ends the
  // round — standing when hitting was advised — is exactly the case FR-025 is
  // written for, and hiding the panel the moment there is nothing left to rank
  // would take the explanation away with it.
  const hasAdvice = ranked.length > 0;
  const hasFeedback = decision !== null && !decision.matched;
  if (!hasAdvice && !hasFeedback) return null;

  return (
    <section
      aria-label="Strategy companion"
      className="flex flex-col gap-3 rounded-xl border border-border bg-panel p-4"
    >
      {hasAdvice ? (
        <Ranking ranked={ranked} expanded={expanded} onToggle={setExpanded} />
      ) : (
        <Heading />
      )}

      <Feedback />
    </section>
  );
}

function Heading() {
  return (
    <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">Expected value</h2>
  );
}

/**
 * FR-022, FR-022a — the ranking behind its disclosure. Split out to keep
 * `CompanionPanel` inside the size cap, as `ActionRow` and `Feedback` already are.
 *
 * `<details>` rather than a hand-rolled button: it carries the expanded state in
 * the accessibility tree and is keyboard-operable without a keydown handler,
 * which NFR-008 requires of every control.
 */
function Ranking({
  ranked,
  expanded,
  onToggle,
}: {
  ranked: RankedAction[];
  expanded: boolean;
  onToggle: (open: boolean) => void;
}) {
  return (
    <details
      data-testid="companion-disclosure"
      open={expanded}
      onToggle={(event) => onToggle(event.currentTarget.open)}
    >
      <summary
        data-testid="companion-summary"
        className="flex cursor-pointer list-none items-baseline gap-2 [&::-webkit-details-marker]:hidden"
      >
        {/* aria-hidden: `details` already announces expanded state, so a screen
            reader naming the arrow would say it twice. */}
        <span
          aria-hidden="true"
          className={`text-[0.7rem] text-accent transition-transform ${expanded ? 'rotate-90' : ''}`}
        >
          ▶
        </span>
        <Heading />
        <span className="text-xs text-ink-muted">
          {expanded ? 'Hide' : 'Show if you want a hint'}
        </span>
      </summary>

      {/* The gap lives here rather than on `details`: `display: flex` on a
          `details` element leaks its content into the collapsed state in some
          browsers, which would defeat the whole disclosure. */}
      <div className="mt-3 flex flex-col gap-3">
        <ul className="flex flex-col gap-1">
          {ranked.map((entry, index) => (
            <ActionRow key={entry.action} entry={entry} isRecommended={index === 0} />
          ))}
        </ul>
        <Explanation />
      </div>
    </details>
  );
}

function ActionRow({ entry, isRecommended }: { entry: RankedAction; isRecommended: boolean }) {
  return (
    <li
      data-testid={`companion-action-${entry.action}`}
      className={`flex items-center justify-between gap-3 rounded px-2 py-1 ${
        isRecommended ? 'bg-felt' : ''
      }`}
    >
      <span className="flex items-center gap-2 text-sm text-ink">
        {ACTION_LABELS[entry.action as Exclude<Action, 'surrender'>] ?? entry.action}
        {isRecommended && (
          <span
            data-testid="companion-recommended"
            className="rounded bg-accent px-1.5 py-0.5 text-xs font-semibold text-ink-inverse"
          >
            Recommended
          </span>
        )}
      </span>
      <span className={`font-mono text-sm tabular-nums ${entry.ev >= 0 ? 'text-win' : 'text-loss'}`}>
        {entry.ev >= 0 ? '+' : ''}
        {entry.ev.toFixed(2)}
      </span>
    </li>
  );
}

/**
 * FR-025: shown once the hand is over, requiring no acknowledgement.
 *
 * Held back until settlement so the correction cannot answer a decision the
 * player has not reached yet — mid-hand it would say "you should have hit"
 * while the next decision of the same hand is still live in front of them.
 */
function Feedback() {
  const misses = useGameStore((s) => s.roundMisses);
  const phase = useGameStore((s) => s.round?.phase);

  if (phase !== 'settled' || misses.length === 0) return null;

  return (
    <div data-testid="companion-feedback" className="flex flex-col gap-1 text-sm text-info">
      {misses.map((miss, index) => (
        <p key={`${miss.chosen}-${miss.recommended}-${index}`}>
          You chose {miss.chosen}; {miss.recommended} was recommended, worth {miss.giveUp.toFixed(2)}{' '}
          more per bet.
        </p>
      ))}
      <p className="text-ink-muted">Play on — nothing is blocked.</p>
    </div>
  );
}
