import { useCallback, useEffect } from 'react';
import { HandView } from './Hand';
import { Controls } from './Controls';
import { Bankroll } from './Bankroll';
import { CompanionPanel } from '../companion/CompanionPanel';
import { ACTION_KEYS } from './actionReasons';
import { useDealPacing } from './useDealPacing';
import { useGameStore } from '../../store/gameStore';
import type { Action } from '../../engine/types';

/**
 * T042 — the table.
 *
 * Composes dealer, player hands, controls and bankroll so that every piece of
 * board state Principle III names — dealer upcard, player hand, hand total,
 * bankroll, current bet — is on screen at every decision point without
 * scrolling.
 */
export function Table() {
  const round = useGameStore((s) => s.round);
  const legal = useGameStore((s) => s.legalActions());
  const act = useGameStore((s) => s.act);
  const deal = useGameStore((s) => s.deal);
  const lastSettled = useGameStore((s) => s.lastSettled);
  const bankroll = useGameStore((s) => s.bankroll);
  const bet = useGameStore((s) => s.bet);

  const dealtCards = round
    ? round.playerHands.reduce((n, h) => n + h.cards.length, 0) + round.dealerHand.cards.length
    : 0;
  const { revealed, cancelPacing } = useDealPacing(round?.seed ?? null, dealtCards);

  const onAct = useCallback(
    (action: Action) => {
      // Any input collapses the deal pacing before it acts (NFR-001).
      cancelPacing();
      act(action);
    },
    [act, cancelPacing],
  );

  useKeyboardActions(legal, onAct, cancelPacing);

  const canDeal = (round === null || round.phase === 'settled') && bankroll >= bet;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4">
      <Bankroll />
      <Felt revealed={revealed} />
      <CompanionPanel />
      <Outcome />

      {canDeal ? (
        <button
          type="button"
          data-testid="deal"
          onClick={() => deal()}
          className="self-start rounded-lg bg-accent px-6 py-2.5 font-semibold text-ink-inverse"
        >
          Deal
        </button>
      ) : (
        <Controls round={round} legal={legal} onAct={onAct} />
      )}

      {lastSettled && (
        <p className="sr-only" role="status" aria-live="polite">
          Round settled. Net change {lastSettled.totalNetChange} chips.
        </p>
      )}
    </div>
  );
}

/** Dealer and player hands. Split out so `Table` stays inside the size cap. */
function Felt({ revealed }: { revealed: number }) {
  const round = useGameStore((s) => s.round);

  if (!round) {
    return (
      <p className="rounded-xl border border-border bg-panel p-6 text-center text-ink-muted">
        Place your bet and deal to begin.
      </p>
    );
  }

  return (
    <>
      <HandView
        hand={round.dealerHand}
        label="Dealer"
        hideHoleCard={!round.dealerHoleCardRevealed}
        revealLimit={revealed}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        {round.playerHands.map((hand, index) => (
          <div key={hand.id} className="min-w-0 flex-1">
            <HandView
              hand={hand}
              label={round.playerHands.length > 1 ? `Your hand ${index + 1}` : 'Your hand'}
              isActive={round.phase === 'player' && index === round.activeHandIndex}
              revealLimit={revealed}
            />
          </div>
        ))}
      </div>
    </>
  );
}

/** NFR-008: every action operable by keyboard alone. */
function useKeyboardActions(legal: Action[], onAct: (a: Action) => void, cancel: () => void) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const entry = Object.entries(ACTION_KEYS).find(([, key]) => key === event.key.toLowerCase());
      if (!entry) {
        cancel();
        return;
      }
      const action = entry[0] as Action;
      if (!legal.includes(action)) return;
      event.preventDefault();
      onAct(action);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [legal, onAct, cancel]);
}

function Outcome() {
  const lastSettled = useGameStore((s) => s.lastSettled);
  const phase = useGameStore((s) => s.round?.phase);
  if (!lastSettled || phase !== 'settled') return null;

  const net = lastSettled.totalNetChange;
  const tone = net > 0 ? 'text-win' : net < 0 ? 'text-loss' : 'text-ink-muted';

  return (
    <p data-testid="outcome" className={`text-lg font-semibold ${tone}`}>
      {net > 0 && `You win ${net} chips`}
      {net < 0 && `You lose ${Math.abs(net)} chips`}
      {net === 0 && 'Push — your bet is returned'}
    </p>
  );
}
