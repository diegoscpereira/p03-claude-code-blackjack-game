import { Explanation } from './Explanation';
import { ACTION_LABELS } from '../table/actionReasons';
import { useGameStore } from '../../store/gameStore';
import type { Action } from '../../engine/types';
import type { RankedAction } from '../../strategy/ev';

/**
 * T074 — the companion panel (FR-022, FR-025, FR-026).
 *
 * Every legal action with its expected value, the top one marked. Note what is
 * absent: there is no dialog, no confirmation, and no way for this panel to
 * refuse an action. FR-025 requires a non-recommended choice to proceed without
 * blocking, so the feedback appears *after* the fact and asks nothing of the
 * player.
 */
export function CompanionPanel() {
  const round = useGameStore((s) => s.round);
  const enabled = useGameStore((s) => s.companionEnabled);
  const ranked = useGameStore((s) => s.rankedActions());
  const decision = useGameStore((s) => s.lastDecision);

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
      <header className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
          Expected value
        </h2>
        <AccuracyBadge />
      </header>

      {hasAdvice && (
        <>
          <ul className="flex flex-col gap-1">
            {ranked.map((entry, index) => (
              <ActionRow key={entry.action} entry={entry} isRecommended={index === 0} />
            ))}
          </ul>
          <Explanation />
        </>
      )}

      <Feedback />
    </section>
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

/** FR-025: shown after the fact, requiring no acknowledgement. */
function Feedback() {
  const decision = useGameStore((s) => s.lastDecision);
  const giveUp = useGameStore((s) => s.lastEvGiveUp);

  if (!decision || decision.matched || giveUp === null) return null;

  return (
    <p data-testid="companion-feedback" className="text-sm text-info">
      You chose {decision.chosen}; {decision.recommended} was recommended, worth{' '}
      {giveUp.toFixed(2)} more per bet. Play on — nothing is blocked.
    </p>
  );
}

/** FR-024b: unavailable rather than 0% before any decision has been taken. */
function AccuracyBadge() {
  const taken = useGameStore((s) => s.decisionsTaken);
  const matched = useGameStore((s) => s.decisionsMatched);

  return (
    <p className="text-xs text-ink-muted" data-testid="ev-accuracy">
      {taken === 0 ? 'Accuracy — not yet available' : `Accuracy ${Math.round((matched / taken) * 100)}%`}
    </p>
  );
}
