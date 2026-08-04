import { handTotal, isNatural } from './hand';
import type {
  Hand,
  HandLogRecord,
  HouseRules,
  Outcome,
  Rank,
  RoundState,
  SettledHand,
  SettledRound,
} from './types';

/**
 * T036 — settlement (FR-013) and the emitted hand record (FR-014).
 *
 * The invariant worth guarding: `totalNetChange` equals the sum of per-hand
 * `netChange`. That single assertion catches most payout bugs, which is why
 * contracts/engine-api.md puts it in every settlement test.
 */
export function settle(state: RoundState, rules: HouseRules): SettledRound {
  const dealerNatural = isNatural(state.dealerHand);
  const dealerTotal = handTotal(state.dealerHand.cards).total;
  const dealerBusted = dealerTotal > 21;

  const hands: SettledHand[] = state.playerHands.map((hand) =>
    settleHand(hand, { dealerNatural, dealerTotal, dealerBusted }, rules),
  );

  const totalNetChange = hands.reduce((total, hand) => total + hand.netChange, 0);

  return { hands, totalNetChange, handLog: buildLog(state, hands, totalNetChange, dealerTotal) };
}

interface DealerResult {
  dealerNatural: boolean;
  dealerTotal: number;
  dealerBusted: boolean;
}

/** FR-013: 3:2 for a natural, 1:1 for a win, push on a tie, loss otherwise. */
function settleHand(hand: Hand, dealer: DealerResult, rules: HouseRules): SettledHand {
  const base = { handId: hand.id };
  const total = handTotal(hand.cards).total;

  if (hand.status === 'busted') {
    return { ...base, outcome: 'bust', netChange: -hand.bet };
  }

  if (isNatural(hand)) {
    if (dealer.dealerNatural) return { ...base, outcome: 'push', netChange: 0 };
    return { ...base, outcome: 'blackjack', netChange: hand.bet * rules.blackjackPays };
  }

  if (dealer.dealerNatural) return { ...base, outcome: 'loss', netChange: -hand.bet };
  if (dealer.dealerBusted) return { ...base, outcome: 'win', netChange: hand.bet };
  if (total > dealer.dealerTotal) return { ...base, outcome: 'win', netChange: hand.bet };
  if (total === dealer.dealerTotal) return { ...base, outcome: 'push', netChange: 0 };
  return { ...base, outcome: 'loss', netChange: -hand.bet };
}

/**
 * FR-014: enough to replay and to analyse. No clock reading and no identifier —
 * `src/sync` assigns `hand_id` and `played_at` at enqueue time, because the
 * engine may do neither.
 */
function buildLog(
  state: RoundState,
  hands: readonly SettledHand[],
  totalNetChange: number,
  dealerTotal: number,
): HandLogRecord {
  return {
    seed: state.seed,
    dealerUpcard: (state.dealerHand.cards[0]?.rank ?? '10') as Rank,
    actions: state.actionLog,
    decisions: state.decisions,
    finalTotals: {
      player: state.playerHands.map((hand) => handTotal(hand.cards).total),
      dealer: dealerTotal,
    },
    outcome: roundOutcome(hands, state),
    netChange: totalNetChange,
  };
}

/**
 * The round's headline outcome, for the analysis view's one-line summary. The
 * per-hand results in `SettledRound.hands` remain the authority; this is a
 * label, and a split round that wins one hand and loses another reads as the
 * net result rather than as either half.
 */
function roundOutcome(hands: readonly SettledHand[], state: RoundState): Outcome {
  if (hands.some((hand) => hand.outcome === 'blackjack')) return 'blackjack';
  if (state.playerHands.every((hand) => hand.status === 'busted')) return 'bust';

  const net = hands.reduce((total, hand) => total + hand.netChange, 0);
  if (net > 0) return 'win';
  if (net < 0) return 'loss';
  return 'push';
}
