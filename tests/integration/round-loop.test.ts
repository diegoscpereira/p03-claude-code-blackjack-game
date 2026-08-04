import { beforeEach, describe, expect, it } from 'vitest';
import { useGameStore } from '../../src/store/gameStore';
import { STARTING_BANKROLL } from '../../src/engine/rules-config';

/**
 * T030 — a complete round through the store: bet, deal, act, dealer, settle,
 * bankroll updated.
 *
 * The unit tests prove the engine's rules. This proves the wiring — that the
 * store dispatches to the reducer, runs the dealer when player hands resolve,
 * and applies settlement to the bankroll exactly once.
 */
const store = () => useGameStore.getState();

beforeEach(() => {
  useGameStore.getState().reset();
});

describe('round loop through the store (User Story 1)', () => {
  it('starts with the default bankroll and no round in progress', () => {
    expect(store().bankroll).toBe(STARTING_BANKROLL);
    expect(store().round).toBeNull();
  });

  it('FR-005: dealing puts cards on the table and takes the bet', () => {
    store().setBet(25);
    store().deal(42);

    const state = store();
    expect(state.round).not.toBeNull();
    expect(state.round!.playerHands[0]!.cards).toHaveLength(2);
    expect(state.round!.dealerHand.cards).toHaveLength(2);
    expect(state.round!.playerHands[0]!.bet).toBe(25);
  });

  it('FR-002: the store offers exactly the engine\'s legal action set', () => {
    store().deal(42);
    const legal = store().legalActions();
    expect(legal).toContain('stand');
    expect(legal).not.toContain('surrender');
  });

  it('FR-007, FR-013: standing runs the dealer and settles the bankroll', () => {
    store().setBet(10);
    store().deal(42);
    store().act('stand');

    const state = store();
    expect(state.round!.phase).toBe('settled');
    expect(state.lastSettled).not.toBeNull();
    expect(state.bankroll).toBe(STARTING_BANKROLL + state.lastSettled!.totalNetChange);
  });

  it('FR-013: the bankroll moves by exactly the settled amount, never twice', () => {
    store().setBet(10);
    store().deal(7);
    store().act('stand');

    const settledOnce = store().bankroll;
    // A repeated action after settlement must be inert (FR-015).
    store().act('stand');
    expect(store().bankroll).toBe(settledOnce);
  });

  it('FR-014: a settled round emits a replayable hand record', () => {
    store().deal(123);
    store().act('stand');

    const log = store().lastSettled!.handLog;
    expect(log.seed).toBe(123);
    expect(log.actions.map((a) => a.action)).toContain('stand');
    expect(log.finalTotals.player.length).toBeGreaterThan(0);
  });

  it('FR-016: the shoe carries across rounds rather than reshuffling every hand', () => {
    store().deal(42);
    store().act('stand');
    const afterFirst = store().carriedShoe!.length;
    expect(afterFirst).toBeLessThan(312);

    // The second round deals from what the first left behind, so the shoe keeps
    // depleting. A reshuffle every hand would put this back to ~308.
    store().deal(43);
    store().act('stand');
    expect(store().carriedShoe!.length).toBeLessThan(afterFirst);
  });

  it('FR-015: acting before a deal is inert rather than an error', () => {
    expect(() => store().act('hit')).not.toThrow();
    expect(store().round).toBeNull();
  });

  it('FR-015: dealing twice does not start a second round over the first', () => {
    store().deal(42);
    const first = store().round;
    store().deal(99);
    expect(store().round).toBe(first);
  });

  it('plays several rounds in sequence with a coherent bankroll', () => {
    let expected = STARTING_BANKROLL;
    for (let seed = 1; seed <= 10; seed++) {
      store().setBet(10);
      store().deal(seed);
      while (store().legalActions().length > 0) {
        store().act('stand');
      }
      expected += store().lastSettled!.totalNetChange;
      expect(store().bankroll).toBe(expected);
    }
  });
});

describe('bankroll and betting (FR-055)', () => {
  it('FR-002: the bet cannot exceed the bankroll', () => {
    store().setBet(99_999);
    expect(store().bet).toBeLessThanOrEqual(STARTING_BANKROLL);
  });

  it('FR-055: a zero bankroll can be reset, and the reset is recorded', () => {
    useGameStore.setState({ bankroll: 0 });
    expect(store().canResetBankroll()).toBe(true);

    store().resetBankroll();
    expect(store().bankroll).toBe(STARTING_BANKROLL);
    expect(store().bankrollResets).toBe(1);
  });

  it('FR-055: a reset is not offered while the player still has chips', () => {
    expect(store().canResetBankroll()).toBe(false);
  });
});
