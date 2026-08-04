import { HandView } from './Hand';
import { ACTION_LABELS } from './actionReasons';
import { profileFor } from '../../bots/profiles';
import { useGameStore } from '../../store/gameStore';
import type { Action, BotSeat as BotSeatModel } from '../../engine/types';

/**
 * T086 — a bot's seat (FR-033).
 *
 * Each action is labelled with the bot's name, so the contrast between the two
 * playstyles is legible while it happens rather than only in the log. The seat
 * shows only the actions revealed so far, which is the whole visible effect of
 * the 600ms window — the underlying hand was resolved at deal time.
 */
interface BotSeatProps {
  seat: BotSeatModel;
  /** Actions belonging to this seat that have been revealed. */
  revealedActions: readonly Action[];
  isActing: boolean;
}

export function BotSeatView({ seat, revealedActions, isActing }: BotSeatProps) {
  const profile = profileFor(seat.profileId);
  const latest = revealedActions[revealedActions.length - 1];

  return (
    <div
      data-testid={`bot-seat-${seat.id}`}
      data-acting={isActing}
      className={`flex min-w-0 flex-1 flex-col gap-2 rounded-xl border p-3 ${
        isActing ? 'border-accent' : 'border-border'
      }`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="truncate text-sm font-semibold text-ink" title={profile.description}>
          {seat.name}
        </h3>
        {latest && (
          <span
            data-testid={`bot-action-${seat.id}`}
            className="shrink-0 rounded bg-felt px-1.5 py-0.5 text-xs text-ink-muted"
          >
            {seat.name.split(' ')[0]}: {ACTION_LABELS[latest as Exclude<Action, 'surrender'>]}
          </span>
        )}
      </div>

      <HandView hand={seat.hand} label={`${seat.name} hand`} />
    </div>
  );
}

/** All seated bots, with each one's revealed actions. */
export function BotSeats() {
  const round = useGameStore((s) => s.round);
  const revealed = useGameStore((s) => s.botActionsRevealed);

  if (!round || round.botSeats.length === 0) return null;

  const botLog = round.actionLog.filter((entry) => entry.botId !== undefined).slice(0, revealed);
  const actingId = round.actionLog.filter((e) => e.botId !== undefined)[revealed - 1]?.botId;

  return (
    <div className="flex flex-col gap-3 sm:flex-row" aria-label="Other players at the table">
      {round.botSeats.map((seat) => (
        <BotSeatView
          key={seat.id}
          seat={seat}
          revealedActions={botLog.filter((e) => e.botId === seat.id).map((e) => e.action)}
          isActing={actingId === seat.id}
        />
      ))}
    </div>
  );
}
