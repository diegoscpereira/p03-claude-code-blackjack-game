import { describe, expect, it } from 'vitest';
import { decide } from '../../../src/bots/decide';
import { BOT_PROFILES } from '../../../src/bots/profiles';
import { recommend } from '../../../src/strategy/ev';
import { createRng } from '../../../src/engine/rng';
import { PHASE_1_RULES } from '../../../src/engine/rules-config';
import { hand, round } from '../../helpers/hands';
import { DEALER_UPCARDS } from '../../fixtures/basic-strategy';

/**
 * T080 — FR-032: two contrasting profiles, one strictly by the book and one
 * that deviates in a way consistent with its documented profile.
 *
 * "Documented" is the operative word. A bot that deviates arbitrarily is a
 * random number generator with a name; these tests pin each deviation to the
 * rule its profile states.
 */
const rules = PHASE_1_RULES;

const at = (player: string, dealer: string) =>
  round({
    playerHands: [hand(player, { id: 'bot-1' })],
    dealerHand: hand(`${dealer},7`, { id: 'dealer' }),
  });

describe('the profiles themselves (FR-031, FR-032)', () => {
  it('FR-032: ships exactly the two contrasting profiles the spec names', () => {
    expect(Object.keys(BOT_PROFILES).sort()).toEqual([
      'aggressive-high-roller',
      'conservative-math',
    ]);
  });

  it('FR-031: every profile is named and documented', () => {
    for (const profile of Object.values(BOT_PROFILES)) {
      expect(profile.name.length).toBeGreaterThan(3);
      expect(profile.description.length).toBeGreaterThan(40);
      expect(profile.betMultiplier).toBeGreaterThan(0);
    }
  });

  it('FR-032: the high roller stakes more than the conservative bot', () => {
    expect(BOT_PROFILES['aggressive-high-roller'].betMultiplier).toBeGreaterThan(
      BOT_PROFILES['conservative-math'].betMultiplier,
    );
  });
});

describe('Conservative Math AI (FR-032)', () => {
  it('FR-032: takes the basic-strategy action at every decision point', () => {
    const mismatches: string[] = [];
    for (const player of ['10,6', 'A,7', '8,8', '5,6', '9,9', 'A,2', '10,10', '5,4,3']) {
      for (const dealer of DEALER_UPCARDS) {
        const state = at(player, dealer);
        const chosen = decide('conservative-math', state, rules, createRng(11));
        const advised = recommend(state, rules);
        if (chosen !== advised) mismatches.push(`${player} vs ${dealer}: ${chosen} != ${advised}`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('FR-032: hits a hard 16 against a dealer 10, exactly as the chart says', () => {
    expect(decide('conservative-math', at('10,6', '10'), rules, createRng(1))).toBe('hit');
  });

  it('FR-032: ignores the seed entirely — it has no randomness to consume', () => {
    const state = at('10,6', '10');
    const seeds = [1, 2, 3, 999].map((s) => decide('conservative-math', state, rules, createRng(s)));
    expect(new Set(seeds).size).toBe(1);
  });
});

describe('Aggressive High-Roller (FR-032)', () => {
  it('FR-032: never takes an action outside its documented deviation rules', () => {
    // Its only licensed deviations are standing on a stiff hand it "feels" will
    // bust, and doubling a two-card 9-11 it would otherwise only hit. Anything
    // else must match basic strategy.
    for (const player of ['10,10', 'A,9', '5,4,3']) {
      for (const dealer of DEALER_UPCARDS) {
        const state = at(player, dealer);
        expect(decide('aggressive-high-roller', state, rules, createRng(5))).toBe(
          recommend(state, rules),
        );
      }
    }
  });

  it('FR-032: deviates from the chart at least sometimes on a stiff hand', () => {
    const deviations = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].filter((seed) => {
      const state = at('10,6', '10');
      return decide('aggressive-high-roller', state, rules, createRng(seed)) !== recommend(state, rules);
    });
    expect(deviations.length).toBeGreaterThan(0);
  });

  it('FR-032: its deviations are contrasts, not mistakes — it never busts a pat 20', () => {
    for (let seed = 0; seed < 50; seed++) {
      expect(decide('aggressive-high-roller', at('10,10', '6'), rules, createRng(seed))).toBe(
        'stand',
      );
    }
  });

  it('FR-031: a given seed always produces the same deviation', () => {
    const state = at('10,6', '10');
    for (let i = 0; i < 10; i++) {
      expect(decide('aggressive-high-roller', state, rules, createRng(77))).toBe(
        decide('aggressive-high-roller', state, rules, createRng(77)),
      );
    }
  });

  it('FR-032: the two profiles visibly disagree across a run of hands', () => {
    let disagreements = 0;
    for (let seed = 0; seed < 40; seed++) {
      const state = at('10,6', '10');
      if (
        decide('aggressive-high-roller', state, rules, createRng(seed)) !==
        decide('conservative-math', state, rules, createRng(seed))
      ) {
        disagreements += 1;
      }
    }
    // The contrast is the whole point of seating both (User Story 5).
    expect(disagreements).toBeGreaterThan(5);
  });
});
