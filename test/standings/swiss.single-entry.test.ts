import { describe, it, expect } from 'vitest';
import { computeSwissStandings } from '../../src/standings/swiss';
import type { Match, PlayerID, StandingRow } from '../../src/standings/types';
import { MatchResult } from '../../src/standings/types';

const must = (rows: StandingRow[], id: PlayerID) => {
  const r = rows.find(x => x.playerId === id);
  if (!r) throw new Error(`missing player ${id}`);
  return r;
};

describe('Swiss – acceptSingleEntryMatches', () => {
  it('mirrors a single-entry win (A beats B)', () => {
    const matches: Match[] = [
      {
        id: 'm1',
        round: 1,
        playerId: 'A',
        opponentId: 'B',
        result: MatchResult.WIN,
        gameWins: 2,
        gameLosses: 0,
        gameDraws: 0,
      },
      // Note: no B->A row entered
    ];

    const rows = computeSwissStandings(matches, {
      eventId: 'SINGLE-1',
      acceptSingleEntryMatches: true,
    });

    // Both A and B should appear after mirroring
    expect(rows.map(r => r.playerId).sort()).toEqual(['A', 'B']);

    // 3/1/0/3 system defaults → A gets 3 MP, B gets 0 MP
    expect(must(rows, 'A').matchPoints).toBe(3);
    expect(must(rows, 'B').matchPoints).toBe(0);

    // Opponents recorded on both sides
    expect(must(rows, 'A').opponents).toContain('B');
    expect(must(rows, 'B').opponents).toContain('A');
  });

  it('does not mirror BYEs (single-entry bye stays one-sided)', () => {
    const matches: Match[] = [
      {
        id: 'm2',
        round: 1,
        playerId: 'C',
        opponentId: null,
        result: MatchResult.BYE,
        gameWins: 0,
        gameLosses: 0,
        gameDraws: 0,
      },
    ];

    const rows = computeSwissStandings(matches, {
      eventId: 'SINGLE-BYE',
      acceptSingleEntryMatches: true,
    });

    // Only C appears, with 3 MP and a bye counted
    expect(rows.map(r => r.playerId)).toEqual(['C']);
    const C = must(rows, 'C');
    expect(C.matchPoints).toBe(3);
    expect(C.byes).toBe(1);
    // No fabricated opponent
    expect(C.opponents.length).toBe(0);
  });

  it('mixed round: already double-entered pair remains single (no duplication), single-entry pair is mirrored', () => {
    const matches: Match[] = [
      // Already double-entered D vs E
      { id: 'de-a', round: 1, playerId: 'D', opponentId: 'E', result: MatchResult.DRAW, gameWins: 1, gameLosses: 1, gameDraws: 1 },
      { id: 'de-b', round: 1, playerId: 'E', opponentId: 'D', result: MatchResult.DRAW, gameWins: 1, gameLosses: 1, gameDraws: 1 },
      // Single-entry F beats G (will be mirrored)
      { id: 'fg-a', round: 1, playerId: 'F', opponentId: 'G', result: MatchResult.WIN, gameWins: 2, gameLosses: 0, gameDraws: 0 },
    ];

    const rows = computeSwissStandings(matches, {
      eventId: 'SINGLE-MIXED',
      acceptSingleEntryMatches: true,
    });

    // All four present
    expect(rows.map(r => r.playerId).sort()).toEqual(['D','E','F','G']);

    // Correct MPs: D/E drew (1 MP each), F won (3), G lost (0)
    expect(must(rows, 'D').matchPoints).toBe(1);
    expect(must(rows, 'E').matchPoints).toBe(1);
    expect(must(rows, 'F').matchPoints).toBe(3);
    expect(must(rows, 'G').matchPoints).toBe(0);

    // No duplication: each has exactly 1 opponent in this single round
    expect(must(rows, 'D').opponents).toEqual(['E']);
    expect(must(rows, 'E').opponents).toEqual(['D']);
    expect(must(rows, 'F').opponents).toEqual(['G']);
    expect(must(rows, 'G').opponents).toEqual(['F']);
  });

  it('deterministic and permutation-invariant after mirroring', () => {
    const base: Match[] = [
      { id: 'ab', round: 1, playerId: 'A', opponentId: 'B', result: MatchResult.WIN, gameWins: 2, gameLosses: 0, gameDraws: 0 },
      { id: 'cd', round: 1, playerId: 'C', opponentId: 'D', result: MatchResult.DRAW, gameWins: 1, gameLosses: 1, gameDraws: 1 },
      // Intentionally omit B->A and D->C
    ];

    const r1 = computeSwissStandings(base, {
      eventId: 'SINGLE-DET',
      acceptSingleEntryMatches: true,
    });
    const r2 = computeSwissStandings([...base].reverse(), {
      eventId: 'SINGLE-DET',
      acceptSingleEntryMatches: true,
    });

    // Same final order and fields
    expect(r1.map(x => x.playerId)).toEqual(r2.map(x => x.playerId));
    expect(r1.map(x => x.matchPoints)).toEqual(r2.map(x => x.matchPoints));
  });

  it('flag disabled: single-entry stays single (only the side you entered appears)', () => {
    const matches: Match[] = [
      { id: 'xy', round: 1, playerId: 'X', opponentId: 'Y', result: MatchResult.WIN, gameWins: 2, gameLosses: 0, gameDraws: 0 },
    ];

    const rOff = computeSwissStandings(matches, {
      eventId: 'SINGLE-OFF',
      acceptSingleEntryMatches: false,
    });

    const rOn = computeSwissStandings(matches, {
      eventId: 'SINGLE-ON',
      acceptSingleEntryMatches: true,
    });

    // Without the flag, only X appears (since only X->Y row exists)
    expect(rOff.map(r => r.playerId)).toEqual(['X']);
    // With the flag, both X and Y appear
    expect(rOn.map(r => r.playerId).sort()).toEqual(['X','Y']);
  });
});
