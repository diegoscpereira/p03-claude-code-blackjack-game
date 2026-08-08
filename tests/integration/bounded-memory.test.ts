import { beforeEach, describe, expect, it } from 'vitest';
import { useGameStore } from '../../src/store/gameStore';
import { OUTBOX_CAP, readOutbox } from '../../src/sync/outbox';
import { clearLocalState } from '../../src/sync/storage';

/**
 * T126 — constitution Principle IV: *"Memory MUST stay bounded across
 * arbitrarily long sessions — per-round state MUST NOT accumulate in unbounded
 * lists or logs."*
 *
 * The failure this guards against is slow and invisible: a list that grows by
 * three entries a hand looks fine in every test that plays one hand, and
 * degrades a session hours in. So this plays 500 hands and asserts that the
 * things which *could* grow are the things which are capped.
 *
 * Three lists are candidates: the round's own action log and decisions, the
 * store's recent-hands list behind the analysis view, and the sync outbox. The
 * first is bounded per round because a round ends; the other two are capped
 * explicitly, and this test is what stops those caps being quietly removed.
 */

const HANDS = 500;
const store = () => useGameStore.getState();

/** Plays one hand to settlement, standing immediately. */
function playHand(seed: number): void {
  const state = store();
  // A hand cannot be dealt without chips, and 500 losing hands would exhaust
  // any starting bankroll — the reset is FR-055's path, not a workaround.
  if (state.bankroll < state.bet) state.resetBankroll();
  state.deal(seed);
  store().collapseBotTurns();
  if (store().round?.phase === 'player') store().act('stand');
}

beforeEach(() => {
  clearLocalState();
  useGameStore.getState().reset();
});

describe('bounded memory across a long session (Principle IV)', () => {
  it('Principle IV: 500 hands leave every growable list capped', () => {
    for (let i = 0; i < HANDS; i += 1) playHand(1000 + i);

    const state = store();
    expect(state.handsPlayed).toBe(HANDS);

    // The analysis view keeps a window, not a history.
    expect(state.recentHands.length).toBeLessThanOrEqual(50);

    // The outbox drops oldest beyond its cap and counts what it dropped, rather
    // than growing until localStorage throws.
    const outbox = readOutbox();
    expect(outbox.hands.length).toBeLessThanOrEqual(OUTBOX_CAP);
    expect(outbox.dropped).toBe(Math.max(0, HANDS - OUTBOX_CAP));
  });

  it('Principle IV: the round action log does not carry over between rounds', () => {
    for (let i = 0; i < 50; i += 1) playHand(2000 + i);
    const after50 = store().round!.actionLog.length;

    for (let i = 0; i < 200; i += 1) playHand(3000 + i);
    const after250 = store().round!.actionLog.length;

    // A round's log is per round. If it accumulated, this would be five times
    // larger rather than the same size.
    expect(after250).toBeLessThanOrEqual(after50 + 4);
    expect(after250).toBeLessThan(20);
  });

  it('Principle IV: the round decisions list stays per-round', () => {
    for (let i = 0; i < 200; i += 1) playHand(4000 + i);
    expect(store().round!.decisions.length).toBeLessThan(10);
  });

  it('Principle IV: the shoe never grows and is rebuilt rather than extended', () => {
    let largest = 0;
    for (let i = 0; i < 200; i += 1) {
      playHand(5000 + i);
      largest = Math.max(largest, store().round!.shoe.length);
    }
    // Six decks is 312 cards; a shoe that grew would exceed its own build size.
    expect(largest).toBeLessThanOrEqual(312);
  });

  it('Principle IV: the serialised local state stays within a sane budget', () => {
    for (let i = 0; i < HANDS; i += 1) playHand(6000 + i);

    // `localStorage` gives roughly 5MB. The cap exists so the queue cannot walk
    // into that limit; measuring the real serialised size is what proves the
    // cap is set somewhere useful rather than merely present.
    const bytes = JSON.stringify(readOutbox()).length;
    expect(bytes).toBeLessThan(2_000_000);
  });

  it('FR-052: lifetime counters keep rising while the lists stay bounded', () => {
    for (let i = 0; i < HANDS; i += 1) playHand(7000 + i);

    const state = store();
    // The point of the cap is that it bounds *storage*, not history. Counters
    // are the thing that must survive, and they are scalars.
    expect(state.handsPlayed).toBe(HANDS);
    expect(state.wins + state.losses + state.pushes).toBe(HANDS);
    expect(state.xp).toBeGreaterThanOrEqual(HANDS * 10);
  });
});
