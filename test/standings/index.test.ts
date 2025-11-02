import { describe, it, expect } from 'vitest';
import {
  computeStandings,
  MatchResult,
} from '../../src/standings';
import type {
  Match,
  StandingRow,
  SingleEliminationStandingRow,
} from '../../src/standings';

describe('standings index entrypoint', () => {
  it('dispatches to swiss when mode is "swiss"', () => {
    const matches: Match[] = [
      {
        id: 'r1-a',
        round: 1,
        playerId: 'A',
        opponentId: 'B',
        result: MatchResult.WIN,
      },
      {
        id: 'r1-b',
        round: 1,
        playerId: 'B',
        opponentId: 'A',
        result: MatchResult.LOSS,
      },
    ];

    const res = computeStandings({
      mode: 'swiss',
      matches,
      options: {
        eventId: 'swiss-test',
      },
    }) as StandingRow[];

    expect(res).toHaveLength(2);
    expect(res[0].playerId).toBe('A');
    expect(res[0].matchPoints).toBeGreaterThan(res[1].matchPoints);
  });

  it('dispatches to roundrobin when mode is "roundrobin"', () => {
    const matches: Match[] = [
      {
        id: 'r1-a',
        round: 1,
        playerId: 'A',
        opponentId: 'B',
        result: MatchResult.WIN,
      },
      {
        id: 'r1-b',
        round: 1,
        playerId: 'B',
        opponentId: 'A',
        result: MatchResult.LOSS,
      },
      {
        id: 'r1-a2',
        round: 1,
        playerId: 'A',
        opponentId: 'C',
        result: MatchResult.LOSS,
      },
      {
        id: 'r1-c2',
        round: 1,
        playerId: 'C',
        opponentId: 'A',
        result: MatchResult.WIN,
      },
    ];

    const res = computeStandings({
      mode: 'roundrobin',
      matches,
      options: {
        eventId: 'rr-test',
      },
    }) as StandingRow[];

    expect(res.map((r) => r.playerId).sort()).toEqual(['A', 'B', 'C'].sort());
  });

  it('dispatches to single elimination when mode is "singleelimination"', () => {
    const matches: Match[] = [
      // semis
      { id: 'sf1-a', round: 1, playerId: 'A', opponentId: 'B', result: MatchResult.WIN },
      { id: 'sf1-b', round: 1, playerId: 'B', opponentId: 'A', result: MatchResult.LOSS },
      { id: 'sf2-c', round: 1, playerId: 'C', opponentId: 'D', result: MatchResult.WIN },
      { id: 'sf2-d', round: 1, playerId: 'D', opponentId: 'C', result: MatchResult.LOSS },
      // final
      { id: 'f-a', round: 2, playerId: 'A', opponentId: 'C', result: MatchResult.WIN },
      { id: 'f-c', round: 2, playerId: 'C', opponentId: 'A', result: MatchResult.LOSS },
    ];

    const res = computeStandings({
      mode: 'singleelimination',
      matches,
      options: {
        eventId: 'se-test',
        seeding: {
          A: 1,
          C: 2,
          B: 3,
          D: 4,
        },
      },
    }) as SingleEliminationStandingRow[];

    expect(res).toHaveLength(4);
    // champion
    expect(res[0].playerId).toBe('A');
    expect(res[0].elimRound).toBe(3); // maxRound=2 → champ=3

    // finalist
    expect(res[1].playerId).toBe('C');
    expect(res[1].elimRound).toBe(2);

    // semifinal losers
    const lastTwo = [res[2].playerId, res[3].playerId].sort();
    expect(lastTwo).toEqual(['B', 'D'].sort());
  });
});
