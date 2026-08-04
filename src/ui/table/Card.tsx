import type { Card as CardModel } from '../../engine/types';

/**
 * T038 — one playing card, with a face-down state for the dealer hole card.
 *
 * Suit colour is the only place presentation reads `suit` at all; no rule in
 * the engine depends on it.
 */

interface CardProps {
  card: CardModel;
  faceDown?: boolean;
}

const RED_SUITS = new Set(['♥', '♦']);

export function PlayingCard({ card, faceDown = false }: CardProps) {
  if (faceDown) {
    return (
      <div
        data-testid="card-face-down"
        aria-label="Face-down card"
        className="flex h-24 w-16 shrink-0 items-center justify-center rounded-lg border-2 border-border bg-felt-deep shadow-md"
      >
        <div className="h-16 w-10 rounded bg-[repeating-linear-gradient(45deg,#2C5545_0,#2C5545_4px,#0A3524_4px,#0A3524_8px)]" />
      </div>
    );
  }

  const isRed = RED_SUITS.has(card.suit);

  return (
    <div
      data-testid="card"
      aria-label={`${card.rank} of ${suitName(card.suit)}`}
      className="flex h-24 w-16 shrink-0 flex-col justify-between rounded-lg border border-border bg-white p-1.5 shadow-md"
    >
      <span className={`text-lg font-bold leading-none ${isRed ? 'text-[#B00020]' : 'text-ink-inverse'}`}>
        {card.rank}
      </span>
      <span className={`self-end text-2xl leading-none ${isRed ? 'text-[#B00020]' : 'text-ink-inverse'}`}>
        {card.suit}
      </span>
    </div>
  );
}

function suitName(suit: CardModel['suit']): string {
  switch (suit) {
    case '♠':
      return 'spades';
    case '♥':
      return 'hearts';
    case '♦':
      return 'diamonds';
    case '♣':
      return 'clubs';
  }
}
