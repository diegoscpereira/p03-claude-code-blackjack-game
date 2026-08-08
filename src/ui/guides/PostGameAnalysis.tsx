import { useGameStore } from '../../store/gameStore';
import { formatEvAccuracy } from '../../progression/accuracy';
import type { HandRecord } from '../../sync/records';

/**
 * T111 — the post-game analysis view (FR-067).
 *
 * Reads this session's hand logs from the store rather than fetching them back
 * from the server. That is a deliberate scope choice: the contract exposes no
 * read endpoint for `hand_logs` (contracts/http-api.md), the records are
 * already local by the time they are queued, and a fetch would put a network
 * round trip behind a view a player opens mid-session. The server copy exists
 * for durability and for the replay claim of User Story 7, not for this screen.
 *
 * The list is capped in the store, so it stays bounded across a long session
 * (Principle IV).
 */
export function PostGameAnalysis() {
  const hands = useGameStore((s) => s.recentHands);
  const taken = useGameStore((s) => s.decisionsTaken);
  const matched = useGameStore((s) => s.decisionsMatched);

  return (
    <div data-testid="post-game-analysis" className="flex flex-col gap-3">
      <p className="text-sm text-ink-muted">
        {/* FR-024b: unavailable before any decision, rather than a misleading 0%. */}
        EV accuracy <span data-testid="ev-accuracy">{formatEvAccuracy(taken, matched)}</span> across{' '}
        {taken} decision{taken === 1 ? '' : 's'}
      </p>

      {hands.length === 0 ? (
        <p className="text-sm text-ink-muted">Play a hand and it will appear here.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {hands.map((record, index) => (
            <HandEntry key={record.handId} record={record} number={hands.length - index} />
          ))}
        </ul>
      )}
    </div>
  );
}

function HandEntry({ record, number }: { record: HandRecord; number: number }) {
  return (
    <li className="rounded-lg border border-border bg-felt px-3 py-2 text-sm text-ink">
      <p className="flex flex-wrap items-baseline gap-x-3">
        <span className="font-semibold">Hand {number}</span>
        <span className="text-ink-muted">dealer showed {record.dealerUpcard}</span>
        <span className={record.netChange >= 0 ? 'text-win' : 'text-loss'}>
          {record.outcome} · {record.netChange >= 0 ? '+' : ''}
          {record.netChange}
        </span>
        {/* SC-008: the seed is shown because it is the whole replay claim — a
            reviewer can reproduce this exact hand from it alone. */}
        <span className="text-xs text-ink-muted">seed {record.seed}</span>
      </p>

      {record.decisions.length > 0 && (
        <ul className="mt-1 flex flex-wrap gap-x-3 text-xs text-ink-muted">
          {record.decisions.map((decision, position) => (
            <li key={`${record.handId}-${position}`}>
              {decision.playerTotal}
              {decision.isSoft ? ' soft' : ''} vs {decision.dealerUpcard}:{' '}
              <span className={decision.matched ? 'text-win' : 'text-loss'}>{decision.chosen}</span>
              {!decision.matched && ` (advised ${decision.recommended})`}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
