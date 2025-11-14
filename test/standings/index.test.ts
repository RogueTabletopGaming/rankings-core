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
        gameWins: 2, gameLosses: 0, gameDraws: 0,
      },
      {
        id: 'r1-b',
        round: 1,
        playerId: 'B',
        opponentId: 'A',
        result: MatchResult.LOSS,
        gameWins: 0, gameLosses: 2, gameDraws: 0,
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
        gameWins: 2, gameLosses: 0, gameDraws: 0,
      },
      {
        id: 'r1-b',
        round: 1,
        playerId: 'B',
        opponentId: 'A',
        result: MatchResult.LOSS,
        gameWins: 0, gameLosses: 2, gameDraws: 0,
      },
      {
        id: 'r1-a2',
        round: 1,
        playerId: 'A',
        opponentId: 'C',
        result: MatchResult.LOSS,
        gameWins: 0, gameLosses: 2, gameDraws: 0,
      },
      {
        id: 'r1-c2',
        round: 1,
        playerId: 'C',
        opponentId: 'A',
        result: MatchResult.WIN,
        gameWins: 2, gameLosses: 0, gameDraws: 0,
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
      { id: 'sf1-a', round: 1, playerId: 'A', opponentId: 'B', result: MatchResult.WIN,  gameWins: 2, gameLosses: 0, gameDraws: 0 },
      { id: 'sf1-b', round: 1, playerId: 'B', opponentId: 'A', result: MatchResult.LOSS, gameWins: 0, gameLosses: 2, gameDraws: 0 },
      { id: 'sf2-c', round: 1, playerId: 'C', opponentId: 'D', result: MatchResult.WIN,  gameWins: 2, gameLosses: 0, gameDraws: 0 },
      { id: 'sf2-d', round: 1, playerId: 'D', opponentId: 'C', result: MatchResult.LOSS, gameWins: 0, gameLosses: 2, gameDraws: 0 },
      // final
      { id: 'f-a', round: 2, playerId: 'A', opponentId: 'C', result: MatchResult.WIN,    gameWins: 2, gameLosses: 0, gameDraws: 0 },
      { id: 'f-c', round: 2, playerId: 'C', opponentId: 'A', result: MatchResult.LOSS,   gameWins: 0, gameLosses: 2, gameDraws: 0 },
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
    expect(res[0].eliminationRound).toBe(3); // maxRound=2 → champ=3

    // finalist
    expect(res[1].playerId).toBe('C');
    expect(res[1].eliminationRound).toBe(2);

    // semifinal losers
    const lastTwo = [res[2].playerId, res[3].playerId].sort();
    expect(lastTwo).toEqual(['B', 'D'].sort());
  });
});

// ---------------- NEW: virtual-bye coverage via the standings facade ----------------

describe('standings index entrypoint – swiss with virtual-bye option', () => {
  /**
   * Scenario for deterministic OMW%/OGWP:
   *  - R1: A gets BYE
   *  - R1: B beats C (2–0)
   *  - R2: A beats B (2–0)
   *
   * B's MWP/OGWP excluding subject A = 1.0 (only vs C, a 2–0 win)
   * → A's OMW% without virtual-bye: mean([1.0]) = 1.0
   * → A's OMW% with virtual-bye(0.5): mean([1.0, 0.5]) = 0.75
   * Same math for OGWP in this tiny data set.
   */
  const baseMatches: Match[] = [
    { id: 'r1-A-bye', round: 1, playerId: 'A', opponentId: null, result: MatchResult.BYE,  gameWins: 0, gameLosses: 0, gameDraws: 0 },
    { id: 'r1-B-C-b', round: 1, playerId: 'B', opponentId: 'C', result: MatchResult.WIN,  gameWins: 2, gameLosses: 0, gameDraws: 0 },
    { id: 'r1-C-B-b', round: 1, playerId: 'C', opponentId: 'B', result: MatchResult.LOSS, gameWins: 0, gameLosses: 2, gameDraws: 0 },
    { id: 'r2-A-B-a', round: 2, playerId: 'A', opponentId: 'B', result: MatchResult.WIN,  gameWins: 2, gameLosses: 0, gameDraws: 0 },
    { id: 'r2-B-A-a', round: 2, playerId: 'B', opponentId: 'A', result: MatchResult.LOSS, gameWins: 0, gameLosses: 2, gameDraws: 0 },
  ];

  it('default (virtual-bye disabled): BYE excluded from OMW%/OGWP', () => {
    const res = computeStandings({
      mode: 'swiss',
      matches: baseMatches,
      options: { eventId: 'IDX-VB-NONE' },
    }) as StandingRow[];

    const A = res.find(r => r.playerId === 'A')!;
    expect(A).toBeDefined();
    expect(A.omwp).toBeCloseTo(1.0, 10);
    expect(A.ogwp).toBeCloseTo(1.0, 10);
    // Virtual opponent is not surfaced
    expect(A.opponents).toEqual(['B']);
  });

  it('enabled: adds a 0.5 virtual entry per BYE to OMW%/OGWP', () => {
    const res = computeStandings({
      mode: 'swiss',
      matches: baseMatches,
      options: {
        eventId: 'IDX-VB-ON',
        tiebreakVirtualBye: { enabled: true, mwp: 0.5, gwp: 0.5 },
      },
    }) as StandingRow[];

    const A = res.find(r => r.playerId === 'A')!;
    expect(A).toBeDefined();
    expect(A.omwp).toBeCloseTo(0.75, 10);
    expect(A.ogwp).toBeCloseTo(0.75, 10);
    // Still invisible as an opponent
    expect(A.opponents).toEqual(['B']);
  });

  it('applies opponent floor to virtual-bye values', () => {
    const res = computeStandings({
      mode: 'swiss',
      matches: baseMatches,
      options: {
        eventId: 'IDX-VB-FLOOR',
        tiebreakFloors: { opponentPctFloor: 0.33 },
        tiebreakVirtualBye: { enabled: true, mwp: 0.1, gwp: 0.1 }, // below floor
      },
    }) as StandingRow[];

    const A = res.find(r => r.playerId === 'A')!;
    // mean([1.0, 0.33]) ≈ 0.665
    expect(A.omwp).toBeCloseTo((1.0 + 0.33) / 2, 3);
    expect(A.ogwp).toBeCloseTo((1.0 + 0.33) / 2, 3);
  });

  it('multiple BYEs contribute multiple virtual entries', () => {
    const matches2: Match[] = [
      ...baseMatches,
      { id: 'r3-A-bye', round: 3, playerId: 'A', opponentId: null, result: MatchResult.BYE, gameWins: 0, gameLosses: 0, gameDraws: 0 },
    ];

    const res = computeStandings({
      mode: 'swiss',
      matches: matches2,
      options: {
        eventId: 'IDX-VB-2BYES',
        tiebreakVirtualBye: { enabled: true, mwp: 0.5, gwp: 0.5 },
      },
    }) as StandingRow[];

    const A = res.find(r => r.playerId === 'A')!;
    // mean([1.0, 0.5, 0.5]) = 2/3
    expect(A.omwp).toBeCloseTo(2 / 3, 10);
    expect(A.ogwp).toBeCloseTo(2 / 3, 10);
    expect(A.opponents).toEqual(['B']);
  });
});
