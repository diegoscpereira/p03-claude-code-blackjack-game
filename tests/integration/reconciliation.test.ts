import { describe, expect, it } from 'vitest';
import { reconcile } from '../../src/sync/reconcile';
import type { ProgressSnapshot } from '../../src/sync/records';
import type { UnlockId } from '../../src/progression/levels';

/**
 * T094 — spec boundary rule 4.
 *
 * > *Monotonic counters take the higher value; hand logs are append-only and
 * > never overwritten; the current bankroll takes the local value, since local
 * > play is authoritative.*
 *
 * The asymmetry is the interesting part and the easy thing to get wrong.
 * Counters are lifetime totals that only ever grow, so "higher wins" can never
 * lose information. Bankroll is a *current* value that moves in both directions,
 * so "higher wins" would hand a player free chips on every reconnect.
 */

const local: ProgressSnapshot = {
  level: 3,
  xp: 130,
  handsPlayed: 12,
  wins: 6,
  losses: 5,
  pushes: 1,
  netBankrollChange: -20,
  bankroll: 980,
  decisionsTaken: 20,
  decisionsMatched: 14,
  unlocks: ['post_game_analysis'],
  bankrollResets: 0,
};

const remote: ProgressSnapshot = {
  level: 4,
  xp: 240,
  handsPlayed: 30,
  wins: 15,
  losses: 12,
  pushes: 3,
  netBankrollChange: 55,
  bankroll: 1500,
  decisionsTaken: 44,
  decisionsMatched: 30,
  unlocks: ['basic_strategy_chart'],
  bankrollResets: 1,
};

describe('counters take the higher value (boundary rule 4)', () => {
  it('boundary rule 4: every monotonic counter takes the maximum', () => {
    const merged = reconcile(local, remote);
    expect(merged).toMatchObject({
      xp: 240,
      handsPlayed: 30,
      wins: 15,
      losses: 12,
      pushes: 3,
      decisionsTaken: 44,
      decisionsMatched: 30,
      bankrollResets: 1,
    });
  });

  it('boundary rule 4: a local value ahead of the remote one is kept', () => {
    const merged = reconcile({ ...local, xp: 999, wins: 40 }, remote);
    expect(merged).toMatchObject({ xp: 999, wins: 40 });
  });

  it('boundary rule 4: reconciliation is commutative for counters', () => {
    expect(reconcile(local, remote).xp).toBe(reconcile(remote, local).xp);
    expect(reconcile(local, remote).handsPlayed).toBe(reconcile(remote, local).handsPlayed);
  });

  it('boundary rule 4: reconciling twice changes nothing', () => {
    const once = reconcile(local, remote);
    expect(reconcile(once, remote)).toEqual(once);
  });
});

describe('unlocks union (FR-051)', () => {
  it('FR-051: an unlock earned on either side is kept', () => {
    const merged = reconcile(local, remote);
    expect(merged.unlocks).toEqual(
      expect.arrayContaining(['post_game_analysis', 'basic_strategy_chart']),
    );
    expect(merged.unlocks).toHaveLength(2);
  });

  it('FR-051: an unlock present on both sides is not duplicated', () => {
    const merged = reconcile(local, { ...remote, unlocks: ['post_game_analysis'] });
    expect(merged.unlocks).toEqual(['post_game_analysis']);
  });

  it('FR-051: the union is ordered by the ladder, not by arrival', () => {
    const merged = reconcile(
      { ...local, unlocks: ['splitting_chart'] },
      { ...remote, unlocks: ['post_game_analysis', 'basic_strategy_chart'] },
    );
    expect(merged.unlocks).toEqual([
      'post_game_analysis',
      'basic_strategy_chart',
      'splitting_chart',
    ]);
  });

  it('ignores an unlock name this build does not recognise', () => {
    // A future build's unlock, or a corrupt row. The cast is the point: this
    // value cannot arise from typed code, only from the wire.
    const fromTheWire = ['post_game_analysis', 'cosmetic_hat'] as unknown as UnlockId[];
    const merged = reconcile(local, { ...remote, unlocks: fromTheWire });
    expect(merged.unlocks).not.toContain('cosmetic_hat');
  });
});

describe('bankroll takes the local value (boundary rule 4)', () => {
  it('boundary rule 4: the local bankroll wins even when the remote one is higher', () => {
    expect(reconcile(local, remote).bankroll).toBe(980);
  });

  it('boundary rule 4: the local bankroll wins when it is higher too', () => {
    expect(reconcile({ ...local, bankroll: 4000 }, remote).bankroll).toBe(4000);
  });

  it('boundary rule 4: net bankroll change follows the local value, not the maximum', () => {
    expect(reconcile(local, remote).netBankrollChange).toBe(-20);
  });
});

describe('derived fields (FR-024a, FR-051d)', () => {
  it('FR-051d: the level is recomputed from the reconciled XP, never merged directly', () => {
    // Taking the higher of two *levels* could disagree with the reconciled XP.
    // Recomputing makes that state unrepresentable.
    expect(reconcile(local, remote).level).toBe(4);
    expect(reconcile({ ...local, xp: 1700 }, { ...remote, level: 2 }).level).toBe(10);
  });

  it('FR-024a: the accuracy counters reconcile independently and the score follows', () => {
    const merged = reconcile(local, remote);
    expect(merged.decisionsTaken).toBe(44);
    expect(merged.decisionsMatched).toBe(30);
    expect(merged).not.toHaveProperty('evAccuracy');
  });
});

describe('missing or partial remote state (FR-066)', () => {
  it('FR-066: no remote row leaves local state untouched', () => {
    expect(reconcile(local, null)).toEqual(local);
  });

  it('FR-066: a remote row of all zeroes cannot roll local progression back', () => {
    const empty: ProgressSnapshot = {
      level: 1,
      xp: 0,
      handsPlayed: 0,
      wins: 0,
      losses: 0,
      pushes: 0,
      netBankrollChange: 0,
      bankroll: 0,
      decisionsTaken: 0,
      decisionsMatched: 0,
      unlocks: [],
      bankrollResets: 0,
    };
    expect(reconcile(local, empty)).toMatchObject({ xp: 130, bankroll: 980, level: 3 });
  });
});
