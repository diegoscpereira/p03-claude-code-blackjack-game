import { handTotal, isPair } from '../engine/hand';
import { shapeOf, upcardKey } from './shape';
import library from './data/explanations.json';
import type { Action, RoundState } from '../engine/types';

/**
 * T073 — resolving an explanation (FR-023, FR-027, FR-028, FR-029).
 *
 * A keyed lookup into the authored library in `data/explanations.json`, keyed
 * on hand shape, dealer upcard and action exactly as FR-023 requires. Resolved
 * locally and synchronously — no network call, which is what keeps the advice
 * working offline (NFR-007) and inside the 100ms budget (NFR-002).
 *
 * The library stores *rationales*, not 1,500 individual strings (research.md
 * R7): the ~370 charted decision points share far fewer distinct reasons, and
 * selecting one from the same three inputs the key is built from keeps the
 * shipped file small while leaving the result a pure function of the key.
 *
 * FR-027 is the rule that shapes the signature: an unmatched key returns
 * `null`, never placeholder text, so the UI can render nothing at all rather
 * than an empty box.
 */

type Family = Record<string, string>;

const FAMILIES: Record<string, Family> = library as unknown as Record<string, Family>;

/** The key an explanation is stored under. Stable across suits and card order. */
export function explanationKey(state: RoundState, action: Action): string | null {
  const hand = state.playerHands[state.activeHandIndex];
  const upcard = state.dealerHand.cards[0];
  if (!hand || !upcard) return null;
  return `${shapeOf(hand.cards)}|${upcardKey(upcard.rank)}|${action}`;
}

export function explain(state: RoundState, action: Action): string | null {
  const hand = state.playerHands[state.activeHandIndex];
  const upcard = state.dealerHand.cards[0];
  if (!hand || !upcard) return null;

  // Surrender is in the vocabulary but is not charted in Phase 1, so it has no
  // entry — and FR-027 says the honest answer is nothing at all.
  const family = FAMILIES[action];
  if (!family) return null;

  const { total, isSoft } = handTotal(hand.cards);
  const dealer = upcardKey(upcard.rank);
  const template = family[selectRationale(state, action, total, isSoft, dealer)] ?? family.fallback;
  if (!template) return null;

  return fill(template, { total, isSoft, dealer, pairRank: pairRankOf(state) });
}

function pairRankOf(state: RoundState): string {
  const cards = state.playerHands[state.activeHandIndex]?.cards ?? [];
  return isPair(cards) ? (cards[0]?.rank ?? '') : '';
}

/**
 * Which rationale fits. Every branch is a total function of the three key
 * inputs, so the same decision point always resolves to the same text (FR-029),
 * and the `fallback` in each family guarantees FR-028's 100% coverage.
 */
function selectRationale(
  state: RoundState,
  action: Action,
  total: number,
  isSoft: boolean,
  dealer: string,
): string {
  const weakUpcard = ['2', '3', '4', '5', '6'].includes(dealer);
  const shape = shapeOf(state.playerHands[state.activeHandIndex]?.cards ?? []);

  switch (action) {
    case 'stand':
      if (shape === 'pair-10') return 'pairTens';
      if (shape === 'pair-9') return 'nineVsSeven';
      if (isSoft) return 'softStrong';
      if (total >= 17) return 'pat';
      return weakUpcard ? 'dealerWeak' : 'fallback';

    case 'hit':
      if (shape.startsWith('pair-')) return 'pairNotWorthSplitting';
      if (total <= 11) return isSoft ? 'cannotBust' : 'lowTotal';
      if (isSoft) return 'softImprove';
      return weakUpcard ? 'fallback' : 'mustImprove';

    case 'double':
      if (isSoft) return 'soft';
      if (total === 11) return 'eleven';
      return weakUpcard ? 'strongVsWeak' : 'fallback';

    case 'split':
      if (shape === 'pair-A' || shape === 'pair-8') return 'acesOrEights';
      if (shape === 'pair-4') return 'doubleAfterSplit';
      return weakUpcard ? 'vsWeak' : 'fallback';

    default:
      return 'fallback';
  }
}

interface FillValues {
  total: number;
  isSoft: boolean;
  dealer: string;
  pairRank: string;
}

/** FR-023: the text names the player total and the dealer upcard. */
function fill(template: string, values: FillValues): string {
  const handPhrase = `${values.isSoft ? 'soft' : 'hard'} ${values.total}`;
  const capitalised = handPhrase.charAt(0).toUpperCase() + handPhrase.slice(1);

  return template
    .replace(/\{hand\}/g, handPhrase)
    .replace(/\{Hand\}/g, capitalised)
    .replace(/\{total\}/g, String(values.total))
    .replace(/\{Total\}/g, String(values.total))
    .replace(/\{upcard\}/g, values.dealer)
    .replace(/\{splitCard\}/g, values.pairRank);
}
