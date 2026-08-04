/**
 * T013 — the shared vocabulary of the game.
 *
 * This module is the single source of the action vocabulary (constitution
 * Principle III). Every other layer imports `Action` from here; none redefines
 * it, so a rename cannot drift between the controls, the help text, the bot
 * profiles, and the hand log.
 *
 * See contracts/engine-api.md. Nothing in `src/engine` may import from `react`,
 * the store, sync, or the UI — the ESLint boundary rule enforces it.
 */

export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';

export type Suit = '♠' | '♥' | '♦' | '♣';

export interface Card {
  readonly rank: Rank;
  /** Presentation only. No rule in this engine depends on suit. */
  readonly suit: Suit;
}

/**
 * The action vocabulary. `surrender` is in the type but is not offered in
 * Phase 1 (spec Out of Scope) — it lives here so that enabling it later is a
 * rules-flag change rather than a vocabulary change rippling through the app.
 */
export type Action = 'hit' | 'stand' | 'double' | 'split' | 'surrender';

export type Outcome = 'win' | 'loss' | 'push' | 'blackjack' | 'bust';

export type HandStatus = 'active' | 'stood' | 'busted' | 'blackjack' | 'settled';

/**
 * Round phases. `betting` and `dealing` exist so the UI can distinguish "no
 * hand yet" from "cards on the way" without inventing its own state.
 */
export type Phase = 'betting' | 'dealing' | 'player' | 'bots' | 'dealer' | 'settled';

export interface Hand {
  readonly id: string;
  readonly cards: readonly Card[];
  /** Always > 0 once dealt. A doubled hand carries twice the original. */
  readonly bet: number;
  readonly status: HandStatus;
  readonly isSplitChild: boolean;
  /** Drives the one-card-and-stand rule (FR-011). */
  readonly isSplitAce: boolean;
  /** Exactly one card may follow (FR-008). */
  readonly doubled: boolean;
}

/**
 * Randomness enters the engine through this interface and nowhere else
 * (research.md R2). `Math.random` appears in no file under `src/engine` — the
 * lint rule makes that a build failure rather than a review note.
 */
export interface Rng {
  /** Returns a float in [0, 1). Seeded and reproducible. */
  next(): number;
}

export interface HouseRules {
  readonly decks: number;
  readonly dealerHitsSoft17: boolean;
  readonly blackjackPays: number;
  readonly maxHands: number;
  readonly doubleAfterSplit: boolean;
  readonly surrenderAllowed: boolean;
  /** Fraction of the shoe dealt before a reshuffle is due (between rounds only). */
  readonly penetration: number;
}

/**
 * Bot identity as the engine sees it.
 *
 * The engine deals bots their cards and tracks their hands, but knows nothing
 * about how they decide — that lives in `src/bots`, which imports from here and
 * never the other way round. So the engine carries a profile *id* rather than
 * the profile itself. This is a deliberate departure from the sketch in
 * contracts/engine-api.md, where `startRound` takes `BotProfile[]`: accepting
 * the profile would invert the layering the contract itself mandates.
 */
export type BotProfileId = 'conservative-math' | 'aggressive-high-roller';

export interface BotSeatConfig {
  readonly id: string;
  readonly name: string;
  readonly profileId: BotProfileId;
  readonly bet: number;
}

export interface BotSeat {
  readonly id: string;
  readonly name: string;
  readonly profileId: BotProfileId;
  readonly hand: Hand;
}

/**
 * One player decision. Automatic actions — the forced stand on a split Ace —
 * produce no `Decision`, per FR-024a's exclusion.
 */
export interface Decision {
  readonly handId: string;
  readonly playerTotal: number;
  readonly isSoft: boolean;
  readonly dealerUpcard: Rank;
  readonly chosen: Action;
  readonly recommended: Action;
  readonly matched: boolean;
}

/** One entry in the round's ordered action log, player or bot. */
export interface ActionRecord {
  readonly handId: string;
  readonly action: Action;
  /** Absent for the player; the seat id for a bot action (FR-036). */
  readonly botId?: string;
  /** True for engine-forced actions such as the split-Ace stand (FR-011). */
  readonly automatic?: boolean;
}

export interface RoundState {
  /** The whole round is reproducible from this alone (FR-004, SC-008). */
  readonly seed: number;
  /** Remaining cards. Reshuffled between rounds only, never mid-round (FR-016). */
  readonly shoe: readonly Card[];
  /** How many cards the shoe held when it was last built, for penetration. */
  readonly shoeSize: number;
  readonly playerHands: readonly Hand[];
  readonly activeHandIndex: number;
  readonly dealerHand: Hand;
  /** Hidden until every player hand resolves. */
  readonly dealerHoleCardRevealed: boolean;
  readonly botSeats: readonly BotSeat[];
  readonly phase: Phase;
  readonly decisions: readonly Decision[];
  readonly actionLog: readonly ActionRecord[];
  /**
   * Chips the player can still commit this round, beyond the bets already on
   * the table. `legalActions` needs it to decide whether Double and Split are
   * affordable, and the contract fixes that signature at `(state, rules)` — so
   * the number travels on the state rather than as a third argument.
   */
  readonly availableBankroll: number;
}

export interface SettledHand {
  readonly handId: string;
  readonly outcome: Outcome;
  /** Signed chips: the change to the bankroll, not the amount returned. */
  readonly netChange: number;
}

/**
 * What the engine emits when a round settles (FR-014).
 *
 * No `handId`, `playerId`, or `playedAt` — `src/sync` assigns those at enqueue
 * time. The engine reads no clock and generates no UUID, so it could not supply
 * them without breaking its own purity contract.
 */
export interface HandLogRecord {
  readonly seed: number;
  readonly dealerUpcard: Rank;
  readonly actions: readonly ActionRecord[];
  readonly decisions: readonly Decision[];
  readonly finalTotals: { readonly player: readonly number[]; readonly dealer: number };
  /** The round's headline outcome; per-hand results are in `SettledRound.hands`. */
  readonly outcome: Outcome;
  readonly netChange: number;
}

export interface SettledRound {
  readonly hands: readonly SettledHand[];
  readonly totalNetChange: number;
  readonly handLog: HandLogRecord;
}
