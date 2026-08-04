import { describe, expect, it } from 'vitest';
import { buildShoe, createShoe, draw, needsReshuffle, shuffle } from '../../../src/engine/shoe';
import { createRng } from '../../../src/engine/rng';
import { PHASE_1_RULES } from '../../../src/engine/rules-config';
import { stackedShoe } from '../../helpers/hands';
import type { Card } from '../../../src/engine/types';

/** T022 — FR-016: shoe construction, shuffle, draw, and penetration. */

const countByRank = (shoe: readonly Card[]): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const card of shoe) counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);
  return counts;
};

describe('buildShoe (FR-016)', () => {
  it('FR-016: a six-deck shoe holds 312 cards', () => {
    expect(buildShoe(6)).toHaveLength(312);
  });

  it('FR-016: every rank appears four times per deck', () => {
    const counts = countByRank(buildShoe(6));
    expect(counts.size).toBe(13);
    for (const [, count] of counts) expect(count).toBe(24);
  });

  it('FR-016: every suit appears in equal number', () => {
    const shoe = buildShoe(1);
    const suits = new Map<string, number>();
    for (const card of shoe) suits.set(card.suit, (suits.get(card.suit) ?? 0) + 1);
    expect([...suits.values()]).toEqual([13, 13, 13, 13]);
  });
});

describe('shuffle (FR-004, FR-016)', () => {
  it('FR-016: preserves the multiset of cards', () => {
    const original = buildShoe(2);
    const shuffled = shuffle(original, createRng(99));
    expect(shuffled).toHaveLength(original.length);
    expect(countByRank(shuffled)).toEqual(countByRank(original));
  });

  it('FR-016: does not mutate its input', () => {
    const original = buildShoe(1);
    const snapshot = [...original];
    shuffle(original, createRng(5));
    expect(original).toEqual(snapshot);
  });

  it('FR-004: the same seed produces the same order', () => {
    const a = shuffle(buildShoe(2), createRng(2024));
    const b = shuffle(buildShoe(2), createRng(2024));
    expect(a).toEqual(b);
  });

  it('FR-004: different seeds produce different orders', () => {
    const a = shuffle(buildShoe(2), createRng(1));
    const b = shuffle(buildShoe(2), createRng(2));
    expect(a).not.toEqual(b);
  });

  it('FR-016: actually reorders — a shuffle that returns its input is a defect', () => {
    const original = buildShoe(6);
    const shuffled = shuffle(original, createRng(7));
    const movedCards = shuffled.filter((card, i) => card.rank !== original[i]?.rank).length;
    // A correct Fisher-Yates over 312 cards leaves almost nothing in place.
    expect(movedCards).toBeGreaterThan(200);
  });

  it('FR-016: distributes positions rather than rotating (Fisher-Yates, not a shift)', () => {
    // Track where the first card of an ordered deck lands across many seeds. A
    // rotation or a biased swap loop would cluster; a correct shuffle will not.
    const landings = new Set<number>();
    for (let seed = 0; seed < 60; seed++) {
      const shuffled = shuffle(buildShoe(1), createRng(seed));
      landings.add(shuffled.findIndex((c) => c.rank === 'A' && c.suit === '♠'));
    }
    expect(landings.size).toBeGreaterThan(30);
  });
});

describe('draw (FR-016)', () => {
  it('FR-016: takes cards in the order the shoe was stacked', () => {
    let shoe: readonly Card[] = stackedShoe('A,10,5');
    const first = draw(shoe);
    expect(first.card?.rank).toBe('A');
    shoe = first.shoe;
    const second = draw(shoe);
    expect(second.card?.rank).toBe('10');
    expect(second.shoe).toHaveLength(1);
  });

  it('FR-016: does not mutate the shoe it was given', () => {
    const shoe = stackedShoe('A,10,5');
    const snapshot = [...shoe];
    draw(shoe);
    expect(shoe).toEqual(snapshot);
  });

  it('FR-015: drawing from an empty shoe returns a null card rather than throwing', () => {
    const result = draw([]);
    expect(result.card).toBeNull();
    expect(result.shoe).toEqual([]);
  });
});

describe('needsReshuffle (FR-016)', () => {
  const size = 312;
  const penetration = PHASE_1_RULES.penetration; // 0.75

  it('FR-016: a fresh shoe does not need reshuffling', () => {
    expect(needsReshuffle(new Array(size).fill(null) as Card[], size, penetration)).toBe(false);
  });

  it('FR-016: reshuffle is due once 75% of the shoe has been dealt', () => {
    const remaining = Math.floor(size * (1 - penetration)); // 78
    expect(needsReshuffle(new Array(remaining + 1).fill(null) as Card[], size, penetration)).toBe(
      false,
    );
    expect(needsReshuffle(new Array(remaining).fill(null) as Card[], size, penetration)).toBe(true);
  });

  it('FR-016: an exhausted shoe always needs reshuffling', () => {
    expect(needsReshuffle([], size, penetration)).toBe(true);
  });
});

describe('createShoe (FR-016)', () => {
  it('FR-016: builds and shuffles in one step, reproducibly', () => {
    expect(createShoe(6, createRng(11))).toEqual(createShoe(6, createRng(11)));
    expect(createShoe(6, createRng(11))).toHaveLength(312);
  });
});
