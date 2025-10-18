// test/standings/roundrobin.test.ts
import { describe, it, expect } from "vitest";
import {
  computeRoundRobinStandings,
} from "../../src/standings/roundrobin";
import {
  MatchResult,
  type Match,
  type StandingRow,
  type PlayerID,
} from "../../src/standings/types";

// ---------- helpers ----------
const must = <T extends { playerId: string }>(
  arr: ReadonlyArray<T>,
  id: string
): T => {
  const row = arr.find((r) => r.playerId === id);
  if (!row) throw new Error(`Missing row for ${id}`);
  return row;
};

// Always enable single-entry mirroring in these tests
const rr = (matches: Match[], eventId: string) =>
  computeRoundRobinStandings(matches, {
    eventId,
    acceptSingleEntryMatches: true,
  });

function makeStandings(ids: string[], mp: number[]): StandingRow[] {
  if (ids.length !== mp.length) {
    throw new Error(
      `makeStandings: ids (${ids.length}) and mp (${mp.length}) must have same length`
    );
  }
  return ids.map((id, i) => {
    const points: number = mp[i]!;
    return {
      rank: i + 1,
      playerId: id,
      matchPoints: points,
      mwp: 0.6,
      omwp: 0.5,
      gwp: 0.6,
      ogwp: 0.5,
      sb: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      byes: 0,
      roundsPlayed: 0,
      gameWins: 0,
      gameLosses: 0,
      gameDraws: 0,
      penalties: 0,
      opponents: [] as PlayerID[],
    };
  });
}

// ---------- suites ----------

describe("Round-robin standings – basics", () => {
  it("single round-robin (4 players) – correct MP and basic order", () => {
    const matches: Match[] = [
      // R1
      { id: "r1-ab", round: 1, playerId: "A", opponentId: "B", result: MatchResult.WIN, gameWins: 2, gameLosses: 0, gameDraws: 0 },
      { id: "r1-cd", round: 1, playerId: "C", opponentId: "D", result: MatchResult.LOSS, gameWins: 0, gameLosses: 2, gameDraws: 0 },

      // R2
      { id: "r2-ac", round: 2, playerId: "A", opponentId: "C", result: MatchResult.LOSS, gameWins: 1, gameLosses: 2, gameDraws: 0 },
      { id: "r2-bd", round: 2, playerId: "B", opponentId: "D", result: MatchResult.WIN, gameWins: 2, gameLosses: 1, gameDraws: 0 },

      // R3
      { id: "r3-ad", round: 3, playerId: "A", opponentId: "D", result: MatchResult.LOSS, gameWins: 0, gameLosses: 2, gameDraws: 0 },
      { id: "r3-bc", round: 3, playerId: "B", opponentId: "C", result: MatchResult.WIN, gameWins: 2, gameLosses: 0, gameDraws: 0 },
    ];

    const rows = rr(matches, "RR-BASIC");
    const R = Object.fromEntries(rows.map((r) => [r.playerId, r]));

    // A: W vs B, L vs C, L vs D => 3 MP
    // B: L vs A, W vs D, W vs C => 6 MP
    // C: W vs A, L vs D, L vs B => 3 MP
    // D: W vs C, L vs B, W vs A => 6 MP
    expect(must(rows, "A").matchPoints).toBe(3);
    expect(must(rows, "B").matchPoints).toBe(6);
    expect(must(rows, "C").matchPoints).toBe(3);
    expect(must(rows, "D").matchPoints).toBe(6);

    // ranks are consistent (ties possible via TBs)
    expect(new Set(rows.map((r) => r.rank)).size).toBe(rows.length);
  });

  it("forfeits affect MP/MWP but don’t fabricate game stats if not provided", () => {
    const matches: Match[] = [
      { id: "r1-ef", round: 1, playerId: "E", opponentId: "F", result: MatchResult.FORFEIT_WIN, gameWins: 0, gameLosses: 0, gameDraws: 0 },
      { id: "r1-fe", round: 1, playerId: "F", opponentId: "E", result: MatchResult.FORFEIT_LOSS, gameWins: 0, gameLosses: 0, gameDraws: 0 },
    ];
    const rows = rr(matches, "RR-FF");
    expect(must(rows, "E").matchPoints).toBe(3);
    expect(must(rows, "F").matchPoints).toBe(0);
    // No game stats were recorded
    expect(must(rows, "E").gameWins).toBe(0);
    expect(must(rows, "F").gameWins).toBe(0);
  });

  it("BYE counts as 3 MP and 2–0 added for GWP denominator", () => {
    const matches: Match[] = [
      { id: "r1-g", round: 1, playerId: "G", opponentId: null, result: MatchResult.BYE, gameWins: 0, gameLosses: 0, gameDraws: 0 },
    ];
    const rows = rr(matches, "RR-BYE");
    expect(must(rows, "G").matchPoints).toBe(3);
    expect(must(rows, "G").gwp).toBeGreaterThanOrEqual(2 / 2);
  });
});

describe("Round-robin standings – tiebreakers", () => {
  it("SB credits opponent MP for wins/draws", () => {
    const matches: Match[] = [
      // A beats B; B beats C; A draws C
      { id: "ab", round: 1, playerId: "A", opponentId: "B", result: MatchResult.WIN, gameWins: 2, gameLosses: 0, gameDraws: 0 },
      { id: "bc", round: 2, playerId: "B", opponentId: "C", result: MatchResult.WIN, gameWins: 2, gameLosses: 0, gameDraws: 0 },
      { id: "ac", round: 3, playerId: "A", opponentId: "C", result: MatchResult.DRAW, gameWins: 1, gameLosses: 1, gameDraws: 1 },
    ];
    const rows = rr(matches, "RR-SB");
    const A = must(rows, "A");
    const B = must(rows, "B");
    const C = must(rows, "C");

    expect(A.matchPoints).toBe(4); // W + D
    expect(B.matchPoints).toBe(3); // W
    expect(C.matchPoints).toBe(1); // D

    // SB should reward A for beating B (3 MP) and drawing C (0.5 * 1)
    expect(A.sb).toBeCloseTo(3 + 0.5 * 1, 10);
  });

  it("percentages stay floored/sane (no < 0.33 on OMW/OGWP when opponents go 0%)", () => {
    // D loses all; E beats D
    const matches: Match[] = [
      { id: "r1-ed", round: 1, playerId: "E", opponentId: "D", result: MatchResult.WIN, gameWins: 2, gameLosses: 0, gameDraws: 0 },
      { id: "r2-df", round: 2, playerId: "D", opponentId: "F", result: MatchResult.LOSS, gameWins: 0, gameLosses: 2, gameDraws: 0 },
      { id: "r3-fd", round: 3, playerId: "F", opponentId: "D", result: MatchResult.WIN, gameWins: 2, gameLosses: 0, gameDraws: 0 },
    ];
    const rows = rr(matches, "RR-FLOOR");
    const E = must(rows, "E");
    expect(E.omwp).toBeGreaterThanOrEqual(0.33 - 1e-12);
    expect(E.ogwp).toBeGreaterThanOrEqual(0.33 - 1e-12);
  });

  it("stability: deterministic per eventId", () => {
    const matches: Match[] = [
      { id: "r1-ab", round: 1, playerId: "A", opponentId: "B", result: MatchResult.DRAW, gameWins: 1, gameLosses: 1, gameDraws: 1 },
      { id: "r1-cd", round: 1, playerId: "C", opponentId: "D", result: MatchResult.DRAW, gameWins: 1, gameLosses: 1, gameDraws: 1 },
      { id: "r2-ac", round: 2, playerId: "A", opponentId: "C", result: MatchResult.WIN,  gameWins: 2, gameLosses: 1, gameDraws: 0 },
      { id: "r2-bd", round: 2, playerId: "B", opponentId: "D", result: MatchResult.LOSS, gameWins: 1, gameLosses: 2, gameDraws: 0 },
    ];
    const r1 = rr(matches, "RR-SEED");
    const r2 = rr(matches, "RR-SEED");
    expect(r1).toEqual(r2);
  });
});

describe("Round-robin standings – mixed input shapes", () => {
  it("accepts two-sided and single-sided rows in the same batch", () => {
    const matches: Match[] = [
      // two-sided for A-B
      { id: "ab-a", round: 1, playerId: "A", opponentId: "B", result: MatchResult.WIN, gameWins: 2, gameLosses: 0, gameDraws: 0 },
      { id: "ab-b", round: 1, playerId: "B", opponentId: "A", result: MatchResult.LOSS, gameWins: 0, gameLosses: 2, gameDraws: 0 },
      // single-sided for C-D
      { id: "cd-c", round: 1, playerId: "C", opponentId: "D", result: MatchResult.DRAW, gameWins: 1, gameLosses: 1, gameDraws: 1 },
    ];
    const rows = rr(matches, "RR-MIXED");
    expect(rows.length).toBe(4);
    expect(must(rows, "C").matchPoints).toBe(1);
    expect(must(rows, "D").matchPoints).toBe(1);
  });
});
