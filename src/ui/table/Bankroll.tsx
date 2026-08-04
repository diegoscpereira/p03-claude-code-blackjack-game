import { useGameStore } from '../../store/gameStore';
import { DEFAULT_BET } from '../../engine/rules-config';

/**
 * T041 — bankroll, bet controls, and the zero-bankroll reset offer (FR-055).
 *
 * Board state must be visible at every decision point without scrolling
 * (Principle III), so bankroll and current bet live here rather than behind a
 * menu.
 */
export function Bankroll() {
  const bankroll = useGameStore((s) => s.bankroll);
  const bet = useGameStore((s) => s.bet);
  const setBet = useGameStore((s) => s.setBet);
  const roundInPlay = useGameStore((s) => s.round !== null && s.round.phase !== 'settled');
  const canReset = useGameStore((s) => s.bankroll <= 0);
  const resetBankroll = useGameStore((s) => s.resetBankroll);
  const resets = useGameStore((s) => s.bankrollResets);

  return (
    <section
      aria-label="Bankroll and bet"
      className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border border-border bg-panel px-4 py-3"
    >
      <Stat label="Bankroll" value={bankroll} testId="bankroll" />
      <Stat label="Bet" value={bet} testId="bet" />

      <div className="flex items-center gap-2">
        <BetButton delta={-DEFAULT_BET} bet={bet} disabled={roundInPlay} onSetBet={setBet} />
        <BetButton delta={DEFAULT_BET} bet={bet} disabled={roundInPlay} onSetBet={setBet} />
      </div>

      {canReset && (
        <div className="flex items-center gap-3">
          <p className="text-sm text-loss">You are out of chips.</p>
          <button
            type="button"
            data-testid="reset-bankroll"
            onClick={resetBankroll}
            className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-ink-inverse"
          >
            Take a bankroll reset
          </button>
        </div>
      )}

      {resets > 0 && (
        // FR-055: resets are shown, not hidden, so lifetime statistics read honestly.
        <p className="text-xs text-ink-muted" data-testid="bankroll-resets">
          {resets} reset{resets === 1 ? '' : 's'} taken
        </p>
      )}
    </section>
  );
}

function Stat({ label, value, testId }: { label: string; value: number; testId: string }) {
  return (
    <p className="flex flex-col">
      <span className="text-xs uppercase tracking-wide text-ink-muted">{label}</span>
      <span className="text-xl font-semibold tabular-nums text-ink" data-testid={testId}>
        {value}
      </span>
    </p>
  );
}

function BetButton({
  delta,
  bet,
  disabled,
  onSetBet,
}: {
  delta: number;
  bet: number;
  disabled: boolean;
  onSetBet: (n: number) => void;
}) {
  const sign = delta > 0 ? '+' : '−';
  return (
    <button
      type="button"
      data-testid={`bet-${delta > 0 ? 'up' : 'down'}`}
      disabled={disabled}
      aria-label={`${delta > 0 ? 'Increase' : 'Decrease'} bet by ${Math.abs(delta)}`}
      onClick={() => onSetBet(bet + delta)}
      className="h-9 w-9 rounded-lg border border-border bg-felt text-lg font-semibold text-ink disabled:cursor-not-allowed disabled:text-ink-muted"
    >
      {sign}
    </button>
  );
}
