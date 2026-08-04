import { PlayingCard } from './Card';
import { handTotal } from '../../engine/hand';
import type { Hand as HandModel } from '../../engine/types';

/**
 * T039 — a hand: its cards and its derived total.
 *
 * The total is computed here from the cards rather than read off the hand,
 * because `Hand` deliberately does not store one — that is what keeps FR-001 in
 * a single place.
 */

interface HandViewProps {
  hand: HandModel;
  label: string;
  /** Hides the second card and suppresses the total (the dealer's hole card). */
  hideHoleCard?: boolean;
  isActive?: boolean;
  /** How many cards to show while the deal is still being paced (T044). */
  revealLimit?: number;
}

export function HandView({
  hand,
  label,
  hideHoleCard = false,
  isActive = false,
  revealLimit,
}: HandViewProps) {
  const visible = revealLimit === undefined ? hand.cards : hand.cards.slice(0, revealLimit);
  const shown = hideHoleCard ? visible.slice(0, 1) : visible;
  const { total, isSoft } = handTotal(shown);

  return (
    <section
      aria-label={label}
      data-testid={`hand-${hand.id}`}
      data-active={isActive}
      className={`rounded-xl border p-3 transition-colors ${
        isActive ? 'border-accent bg-felt' : 'border-border bg-felt/60'
      }`}
    >
      <header className="mb-2 flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">{label}</h3>
        <p className="text-sm text-ink" data-testid={`total-${hand.id}`}>
          {hideHoleCard && hand.cards.length > 1 ? (
            <span className="text-ink-muted">showing {total}</span>
          ) : (
            <>
              <span className="font-semibold">{total}</span>
              {isSoft && <span className="ml-1 text-ink-muted">soft</span>}
            </>
          )}
        </p>
      </header>

      <div className="flex gap-2">
        {shown.map((card, index) => (
          <PlayingCard key={`${card.rank}${card.suit}${index}`} card={card} />
        ))}
        {hideHoleCard && hand.cards.length > 1 && <PlayingCard card={hand.cards[1]!} faceDown />}
      </div>

      <StatusBadge status={hand.status} doubled={hand.doubled} bet={hand.bet} />
    </section>
  );
}

function StatusBadge({
  status,
  doubled,
  bet,
}: {
  status: HandModel['status'];
  doubled: boolean;
  bet: number;
}) {
  if (bet === 0) return null;
  return (
    <p className="mt-2 text-xs text-ink-muted">
      Bet {bet}
      {doubled && ' (doubled)'}
      {status === 'busted' && <span className="ml-2 font-semibold text-loss">Bust</span>}
      {status === 'blackjack' && <span className="ml-2 font-semibold text-accent">Blackjack</span>}
      {status === 'stood' && <span className="ml-2">Stood</span>}
    </p>
  );
}
