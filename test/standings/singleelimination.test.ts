// test/standings/singleelimination.test.ts
import { describe, it, expect } from 'vitest';
import {
  computeSingleEliminationStandings,
} from '../../src/standings/singleelimination';
import {
  MatchResult,
  type Match,
  type SingleEliminationStandingRow,
} from '../../src/standings/types';

describe('computeSingleElimStandings', () => {
  it('ranks the champion first (final winner gets maxRound+1)', () => {
    const matches: Match[] = [
      // semifinals
      { id: 'sf1-a', round: 1, playerId: 'A', opponentId: 'B', result: MatchResult.WIN },
      { id: 'sf1-b', round: 1, playerId: 'B', opponentId: 'A', result: MatchResult.LOSS },
      { id: 'sf2-c', round: 1, playerId: 'C', opponentId: 'D', result: MatchResult.WIN },
      { id: 'sf2-d', round: 1, playerId: 'D', opponentId: 'C', result: MatchResult.LOSS },
      // final
      { id: 'f-a', round: 2, playerId: 'A', opponentId: 'C', result: MatchResult.WIN },
      { id: 'f-c', round: 2, playerId: 'C', opponentId: 'A', result: MatchResult.LOSS },
    ];

    const res = computeSingleEliminationStandings(matches, {
      eventId: 'basic',
    });

    expect(res).toHaveLength(4);
    expect(res[0].playerId).toBe('A');
    expect((res[0] as SingleEliminationStandingRow).elimRound).toBe(3); // maxRound=2 → champ=3
    expect(res[1].playerId).toBe('C');

    const lastTwo = [res[2].playerId, res[3].playerId].sort();
    expect(lastTwo).toEqual(['B', 'D']);
  });

  it('uses seeding to break ties for players eliminated in the same round', () => {
    const matches: Match[] = [
      // semifinals
      { id: 'sf1-a', round: 1, playerId: 'A', opponentId: 'B', result: MatchResult.WIN },
      { id: 'sf1-b', round: 1, playerId: 'B', opponentId: 'A', result: MatchResult.LOSS },
      { id: 'sf2-c', round: 1, playerId: 'C', opponentId: 'D', result: MatchResult.WIN },
      { id: 'sf2-d', round: 1, playerId: 'D', opponentId: 'C', result: MatchResult.LOSS },
      // final
      { id: 'f-a', round: 2, playerId: 'A', opponentId: 'C', result: MatchResult.WIN },
      { id: 'f-c', round: 2, playerId: 'C', opponentId: 'A', result: MatchResult.LOSS },
    ];

    const res = computeSingleEliminationStandings(matches, {
      eventId: 'seeded',
      seeding: {
        A: 1,
        C: 2,
        B: 3,
        D: 4,
      },
    });

    expect(res[0].playerId).toBe('A');
    expect(res[1].playerId).toBe('C');
    // semiloser tie → seeding decides
    expect(res[2].playerId).toBe('B');
    expect(res[3].playerId).toBe('D');
  });

  it('falls back to penalties if seeding is missing or equal', () => {
    const matches: Match[] = [
      // semifinal 1
      {
        id: 'sf1-a',
        round: 1,
        playerId: 'A',
        opponentId: 'B',
        result: MatchResult.LOSS,
        penalties: 1, // A has penalty
      },
      {
        id: 'sf1-b',
        round: 1,
        playerId: 'B',
        opponentId: 'A',
        result: MatchResult.WIN,
      },
      // semifinal 2
      {
        id: 'sf2-c',
        round: 1,
        playerId: 'C',
        opponentId: 'D',
        result: MatchResult.LOSS,
      },
      {
        id: 'sf2-d',
        round: 1,
        playerId: 'D',
        opponentId: 'C',
        result: MatchResult.WIN,
      },
      // final
      {
        id: 'f-b',
        round: 2,
        playerId: 'B',
        opponentId: 'D',
        result: MatchResult.WIN,
      },
      {
        id: 'f-d',
        round: 2,
        playerId: 'D',
        opponentId: 'B',
        result: MatchResult.LOSS,
      },
    ];

    const res = computeSingleEliminationStandings(matches, {
      eventId: 'penalty-fallback',
    });

    expect(res[0].playerId).toBe('B'); // champion
    expect(res[1].playerId).toBe('D'); // finalist
    // A vs C → both eliminated in round 1, but A has penalties
    expect(res[2].playerId).toBe('C');
    expect(res[3].playerId).toBe('A');
  });

  it('works with an incomplete bracket (only semifinals)', () => {
    const matches: Match[] = [
      { id: 'sf1-a', round: 1, playerId: 'A', opponentId: 'B', result: MatchResult.WIN },
      { id: 'sf1-b', round: 1, playerId: 'B', opponentId: 'A', result: MatchResult.LOSS },
      { id: 'sf2-c', round: 1, playerId: 'C', opponentId: 'D', result: MatchResult.WIN },
      { id: 'sf2-d', round: 1, playerId: 'D', opponentId: 'C', result: MatchResult.LOSS },
    ];

    const res = computeSingleEliminationStandings(matches, {
      eventId: 'incomplete',
    });

    expect(res).toHaveLength(4);

    const top = [res[0].playerId, res[1].playerId].sort();
    expect(top).toEqual(['A', 'C']);

    const bottom = [res[2].playerId, res[3].playerId].sort();
    expect(bottom).toEqual(['B', 'D']);
  });

  //
  // 🔥 New scenarios: double loss
  //

  it('handles a double loss in a semifinal when BOTH sides are provided', () => {
    // A vs B → both disqualified / both lose
    // C vs D → normal
    const matches: Match[] = [
      // semifinal 1: double loss
      {
        id: 'sf1-a',
        round: 1,
        playerId: 'A',
        opponentId: 'B',
        result: MatchResult.LOSS,
      },
      {
        id: 'sf1-b',
        round: 1,
        playerId: 'B',
        opponentId: 'A',
        result: MatchResult.LOSS,
      },
      // semifinal 2: normal
      {
        id: 'sf2-c',
        round: 1,
        playerId: 'C',
        opponentId: 'D',
        result: MatchResult.WIN,
      },
      {
        id: 'sf2-d',
        round: 1,
        playerId: 'D',
        opponentId: 'C',
        result: MatchResult.LOSS,
      },
      // final: only C advances, but there is no opponent → no final match recorded
    ];

    const res = computeSingleEliminationStandings(matches, {
      eventId: 'double-loss-semi',
      // we can also pass seeding if we want to break A/B
    });

    // C should be at the top because C is the only player that actually advanced
    expect(res[0].playerId).toBe('C');

    // D lost to C → same round as A/B, but D lost to the finalist
    // A and B both lost in R1 (same as D) but we didn't give seeding,
    // so the function will fall back to penalties / hash.
    const rest = [res[1].playerId, res[2].playerId, res[3].playerId];
    expect(rest.sort()).toEqual(['A', 'B', 'D'].sort());

    // A/B MUST have elimRound = 1
    const a = res.find((r) => r.playerId === 'A') as SingleEliminationStandingRow;
    const b = res.find((r) => r.playerId === 'B') as SingleEliminationStandingRow;
    expect(a.elimRound).toBe(1);
    expect(b.elimRound).toBe(1);
  });

  it('handles a double loss in the FINAL (no champion), and uses seeding to order the two finalists', () => {
    // A beats B, C beats D → final is A vs C
    // but in the final both get a loss (DQ / deck issue / etc.)
    const matches: Match[] = [
      // semifinals
      { id: 'sf1-a', round: 1, playerId: 'A', opponentId: 'B', result: MatchResult.WIN },
      { id: 'sf1-b', round: 1, playerId: 'B', opponentId: 'A', result: MatchResult.LOSS },
      { id: 'sf2-c', round: 1, playerId: 'C', opponentId: 'D', result: MatchResult.WIN },
      { id: 'sf2-d', round: 1, playerId: 'D', opponentId: 'C', result: MatchResult.LOSS },
      // final: double loss
      { id: 'f-a', round: 2, playerId: 'A', opponentId: 'C', result: MatchResult.LOSS },
      { id: 'f-c', round: 2, playerId: 'C', opponentId: 'A', result: MatchResult.LOSS },
    ];

    const res = computeSingleEliminationStandings(matches, {
      eventId: 'double-loss-final',
      // lower seed = better
      seeding: {
        A: 1,
        C: 2,
        B: 3,
        D: 4,
      },
    });

    // Because BOTH finalists lost in round 2, neither should get elimRound=3.
    const a = res.find((r) => r.playerId === 'A') as SingleEliminationStandingRow;
    const c = res.find((r) => r.playerId === 'C') as SingleEliminationStandingRow;
    expect(a.elimRound).toBe(2);
    expect(c.elimRound).toBe(2);

    // Since they tied on elimRound, we use seeding → A before C
    expect(res[0].playerId).toBe('A');
    expect(res[1].playerId).toBe('C');

    // semifinal losers
    const lastTwo = [res[2].playerId, res[3].playerId].sort();
    expect(lastTwo).toEqual(['B', 'D'].sort());
  });

  it('handles double loss in an early round and uses seeding to order ALL players of that round', () => {
    // 8-player bracket, but only R1 is reported.
    // Two matches have double loss → 4 players tied on R1.
    const matches: Match[] = [
      // R1 match 1: double loss
      { id: 'r1-a', round: 1, playerId: 'A', opponentId: 'B', result: MatchResult.LOSS },
      { id: 'r1-b', round: 1, playerId: 'B', opponentId: 'A', result: MatchResult.LOSS },

      // R1 match 2: double loss
      { id: 'r1-c', round: 1, playerId: 'C', opponentId: 'D', result: MatchResult.LOSS },
      { id: 'r1-d', round: 1, playerId: 'D', opponentId: 'C', result: MatchResult.LOSS },

      // R1 match 3: normal
      { id: 'r1-e', round: 1, playerId: 'E', opponentId: 'F', result: MatchResult.WIN },
      { id: 'r1-f', round: 1, playerId: 'F', opponentId: 'E', result: MatchResult.LOSS },

      // R1 match 4: normal
      { id: 'r1-g', round: 1, playerId: 'G', opponentId: 'H', result: MatchResult.WIN },
      { id: 'r1-h', round: 1, playerId: 'H', opponentId: 'G', result: MatchResult.LOSS },
    ];

    const res = computeSingleEliminationStandings(matches, {
      eventId: 'double-loss-early',
      seeding: {
        // top seeds are the ones who actually advanced
        E: 1,
        G: 2,
        A: 3,
        B: 4,
        C: 5,
        D: 6,
        F: 7,
        H: 8,
      },
    });

    // E and G won → should be ahead (same elimRound but better seeds)
    expect(res[0].playerId).toBe('E');
    expect(res[1].playerId).toBe('G');

    // A, B, C, D all lost in round 1. Seeding should decide order.
    const nextFour = res.slice(2, 6).map((r) => r.playerId);
    // Because we seeded A=3, B=4, C=5, D=6, we expect that exact order
    expect(nextFour).toEqual(['A', 'B', 'C', 'D']);

    // F and H lost normal R1 matches too but had worse seeds
    const lastTwo = res.slice(6).map((r) => r.playerId);
    expect(lastTwo).toEqual(['F', 'H']);
  });
});
