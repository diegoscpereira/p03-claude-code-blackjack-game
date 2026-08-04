import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGameStore } from '../../src/store/gameStore';
import { clearLocalState } from '../../src/sync/storage';
import { BOT_TURN_MS } from '../../src/bots/profiles';

/**
 * T082 — FR-036, FR-037: bot turns collapse on input, and the collapsed
 * outcome equals the un-collapsed one.
 *
 * FR-037 is the requirement with teeth: the turn window is *presentation
 * pacing only*. It must not delay engine resolution, and skipping it must not
 * change any outcome. That makes the two runs below directly comparable.
 */
beforeEach(() => {
  vi.useFakeTimers();
  clearLocalState();
  useGameStore.getState().reset();
  useGameStore.getState().dismissTutorial();
});

afterEach(() => {
  vi.useRealTimers();
});

const SEED = 4242;

/** Plays one round, letting every bot turn run its full 600ms window. */
function playPaced(): { log: string; net: number } {
  useGameStore.getState().deal(SEED);
  while (useGameStore.getState().controlsLocked()) {
    vi.advanceTimersByTime(BOT_TURN_MS);
  }
  useGameStore.getState().act('stand');
  return snapshot();
}

/** Plays the same round, collapsing the bot turns immediately. */
function playCollapsed(): { log: string; net: number } {
  useGameStore.getState().deal(SEED);
  useGameStore.getState().collapseBotTurns();
  useGameStore.getState().act('stand');
  return snapshot();
}

function snapshot() {
  const state = useGameStore.getState();
  return {
    log: JSON.stringify(state.round?.actionLog ?? []),
    net: state.lastSettled?.totalNetChange ?? 0,
  };
}

describe('bot turn pacing (FR-033, FR-034)', () => {
  it('FR-033: a bot turn is held for 600ms', () => {
    expect(BOT_TURN_MS).toBe(600);
  });

  it('FR-034: the player controls are locked while a bot is acting', () => {
    useGameStore.getState().deal(SEED);
    expect(useGameStore.getState().controlsLocked()).toBe(true);
  });

  it('FR-034: control returns to the player once the bots finish', () => {
    useGameStore.getState().deal(SEED);
    vi.advanceTimersByTime(BOT_TURN_MS * 20);
    expect(useGameStore.getState().controlsLocked()).toBe(false);
  });

  it('FR-037: pacing does not delay engine resolution — the hand exists at once', () => {
    useGameStore.getState().deal(SEED);
    // No timers advanced: the cards are already dealt and settled in state.
    expect(useGameStore.getState().round!.playerHands[0]!.cards).toHaveLength(2);
    expect(useGameStore.getState().round!.botSeats.length).toBeGreaterThan(0);
  });
});

describe('collapsing bot turns (FR-036, FR-037)', () => {
  it('FR-037: the collapsed outcome equals the un-collapsed outcome', () => {
    const paced = playPaced();
    useGameStore.getState().reset();
    useGameStore.getState().dismissTutorial();
    const collapsed = playCollapsed();

    expect(collapsed.net).toBe(paced.net);
  });

  it('FR-036: every skipped bot action still appears in the action log', () => {
    const paced = playPaced();
    useGameStore.getState().reset();
    useGameStore.getState().dismissTutorial();
    const collapsed = playCollapsed();

    expect(collapsed.log).toBe(paced.log);
  });

  it('FR-036: collapsing resolves all remaining bot turns at once', () => {
    useGameStore.getState().deal(SEED);
    useGameStore.getState().collapseBotTurns();
    expect(useGameStore.getState().controlsLocked()).toBe(false);
  });

  it('FR-036: the input that collapses the turns is consumed, not applied', () => {
    useGameStore.getState().deal(SEED);
    expect(useGameStore.getState().controlsLocked()).toBe(true);

    const before = useGameStore.getState().round!.playerHands[0]!.cards.length;
    // A Hit arriving during bot turns must skip, never hit the player's hand.
    useGameStore.getState().act('hit');
    expect(useGameStore.getState().round!.playerHands[0]!.cards).toHaveLength(before);
  });

  it('FR-036: collapsing twice is harmless', () => {
    useGameStore.getState().deal(SEED);
    useGameStore.getState().collapseBotTurns();
    const after = useGameStore.getState().round;
    useGameStore.getState().collapseBotTurns();
    expect(useGameStore.getState().round).toBe(after);
  });

  it('FR-035: collapsing does not change the player bankroll either', () => {
    const paced = playPaced();
    const pacedBankroll = useGameStore.getState().bankroll;

    useGameStore.getState().reset();
    useGameStore.getState().dismissTutorial();
    playCollapsed();

    expect(useGameStore.getState().bankroll).toBe(pacedBankroll);
    expect(paced.net).toBe(useGameStore.getState().lastSettled!.totalNetChange);
  });
});
