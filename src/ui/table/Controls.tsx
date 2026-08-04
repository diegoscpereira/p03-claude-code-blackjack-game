import { ACTION_KEYS, ACTION_LABELS, disabledReason } from './actionReasons';
import { PHASE_1_RULES } from '../../engine/rules-config';
import type { Action, RoundState } from '../../engine/types';

/**
 * T040 — the action controls.
 *
 * Renders exactly the engine's action vocabulary, enabling only what
 * `legalActions` returned and disabling the rest *with a stated reason*
 * (FR-002, constitution Principle III). Nothing here decides legality; it only
 * reports it, which is what makes "the control cannot lie" structural.
 */

const OFFERED: Exclude<Action, 'surrender'>[] = ['hit', 'stand', 'double', 'split'];

interface ControlsProps {
  round: RoundState | null;
  legal: Action[];
  onAct: (action: Action) => void;
  /** True while bot turns are pending — controls stay visible but inert (FR-034). */
  locked?: boolean;
}

export function Controls({ round, legal, onAct, locked = false }: ControlsProps) {
  return (
    <div
      role="group"
      aria-label="Player actions"
      className="flex flex-wrap gap-2"
      data-testid="controls"
    >
      {OFFERED.map((action) => {
        const isLegal = legal.includes(action) && !locked;
        const reason = locked
          ? 'Wait for the other players'
          : disabledReason(action, round, PHASE_1_RULES);

        return (
          <ActionButton
            key={action}
            action={action}
            enabled={isLegal}
            reason={reason}
            onAct={onAct}
          />
        );
      })}
    </div>
  );
}

interface ActionButtonProps {
  action: Exclude<Action, 'surrender'>;
  enabled: boolean;
  reason: string | null;
  onAct: (action: Action) => void;
}

function ActionButton({ action, enabled, reason, onAct }: ActionButtonProps) {
  const label = ACTION_LABELS[action];
  const key = ACTION_KEYS[action];
  const reasonId = `reason-${action}`;

  return (
    <div className="flex flex-col">
      <button
        type="button"
        data-testid={`action-${action}`}
        disabled={!enabled}
        aria-describedby={!enabled && reason ? reasonId : undefined}
        onClick={() => onAct(action)}
        className={`min-w-24 rounded-lg px-4 py-2 font-semibold transition-colors ${
          enabled
            ? 'bg-accent text-ink-inverse hover:brightness-110'
            : 'cursor-not-allowed bg-panel text-ink-muted'
        }`}
      >
        {label}
        <span className="ml-1.5 text-xs font-normal opacity-70">({key.toUpperCase()})</span>
      </button>
      {!enabled && reason && (
        <span id={reasonId} className="mt-1 max-w-40 text-xs text-ink-muted">
          {reason}
        </span>
      )}
    </div>
  );
}
