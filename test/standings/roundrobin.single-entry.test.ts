import { describe, it, expect } from "vitest";
import type { Match, PlayerID } from "../../src/standings/types";
import { MatchResult } from "../../src/standings/types";
import { computeRoundRobinStandings } from "../../src/standings/roundrobin";

/** tiny helper to fetch a row or throw (nice error messages) */
const mustRow = (rows: ReturnType<typeof computeRoundRobinStandings>, id: PlayerID) => {
  const r = rows.find(x => x.playerId === id);
  if (!r) throw new Error(`Missing row for ${id}`);
  return r;
};

describe("Round-robin standings – acceptSingleEntryMatches", () => {
  it("throws by default (acceptSingleEntryMatches=false) when a mirror is missing", () => {
    const matches: Match[] = [
      // Only A’s perspective is supplied (no mirrored entry for B)
      { id: "m1", round: 1, playerId: "A", opponentId: "B", result: MatchResult.WIN, gameWins: 2, gameLosses: 0, gameDraws: 0 },
      // other games complete as mirrors
      { id: "m2a", round: 1, playerId: "C", opponentId: "D", result: MatchResult.WIN, gameWins: 2, gameLosses: 0, gameDraws: 0 },
      { id: "m2b", round: 1, playerId: "D", opponentId: "C", result: MatchResult.LOSS, gameWins: 0, gameLosses: 2, gameDraws: 0 },
    ];
    expect(() => computeRoundRobinStandings(matches, { eventId: "RR-SE-0" }))
      .toThrow(); // strict mode should complain about the missing mirror
  });

  it("reconstructs missing mirrors when acceptSingleEntryMatches=true", () => {
    // 3 players, single-entry per pairing:
    // A beats B; B beats C; C draws A.
    const matches: Match[] = [
      { id: "ab", round: 1, playerId: "A", opponentId: "B", result: MatchResult.WIN,  gameWins: 2, gameLosses: 0, gameDraws: 0 },
      { id: "bc", round: 2, playerId: "B", opponentId: "C", result: MatchResult.WIN,  gameWins: 2, gameLosses: 1, gameDraws: 0 },
      { id: "ca", round: 3, playerId: "C", opponentId: "A", result: MatchResult.DRAW, gameWins: 1, gameLosses: 1, gameDraws: 1 },
    ];

    const rows = computeRoundRobinStandings(matches, {
      eventId: "RR-SE-1",
      acceptSingleEntryMatches: true,
    });

    const A = mustRow(rows, "A");
    const B = mustRow(rows, "B");
    const C = mustRow(rows, "C");

    // MP with 3/1/0: A: W vs B (3) + D vs C (1) = 4
    //                 B: W vs C (3) + L vs A (0) = 3
    //                 C: D vs A (1) + L vs B (0) = 1
    expect(A.matchPoints).toBe(4);
    expect(B.matchPoints).toBe(3);
    expect(C.matchPoints).toBe(1);

    // sanity bounds
    for (const r of [A, B, C]) {
      expect(r.mwp).toBeGreaterThanOrEqual(0);
      expect(r.mwp).toBeLessThanOrEqual(1);
      expect(r.gwp).toBeGreaterThanOrEqual(0);
      expect(r.gwp).toBeLessThanOrEqual(1);
      expect(r.omwp).toBeGreaterThanOrEqual(0.33 - 1e-12); // floored per spec
      expect(r.ogwp).toBeGreaterThanOrEqual(0.33 - 1e-12);
    }
  });

  it("handles BYE and FORFEIT in single-entry form", () => {
    const matches: Match[] = [
      // D receives a BYE as a single entry
      { id: "bye-d", round: 1, playerId: "D", opponentId: null, result: MatchResult.BYE, gameWins: 0, gameLosses: 0, gameDraws: 0 },
      // E wins by forfeit over F (single entry)
      { id: "ff", round: 1, playerId: "E", opponentId: "F", result: MatchResult.FORFEIT_WIN, gameWins: 0, gameLosses: 0, gameDraws: 0 },
    ];

    const rows = computeRoundRobinStandings(matches, {
      eventId: "RR-SE-2",
      acceptSingleEntryMatches: true,
    });

    const D = mustRow(rows, "D");
    const E = mustRow(rows, "E");
    const F = mustRow(rows, "F");

    // BYE → +3 MP
    expect(D.matchPoints).toBeGreaterThanOrEqual(3);

    // Forfeit win/loss should affect MP/MWP but not fabricate game stats
    expect(E.matchPoints).toBeGreaterThan(0);
    expect(F.matchPoints).toBe(0);

    // We didn’t enter gameWins for the forfeit; ensure they aren’t fabricated
    // (Depending on your implementation this might stay 0, or carry what was provided.)
    expect(E.gameWins).toBe(0);
    expect(F.gameWins).toBe(0);
  });

  it("single-entry vs full mirrors produce identical standings (determinism check)", () => {
    // Full mirrored set
    const mirrored: Match[] = [
      { id: "m1a", round: 1, playerId: "A", opponentId: "B", result: MatchResult.WIN,  gameWins: 2, gameLosses: 0, gameDraws: 0 },
      { id: "m1b", round: 1, playerId: "B", opponentId: "A", result: MatchResult.LOSS, gameWins: 0, gameLosses: 2, gameDraws: 0 },

      { id: "m2a", round: 2, playerId: "B", opponentId: "C", result: MatchResult.WIN,  gameWins: 2, gameLosses: 1, gameDraws: 0 },
      { id: "m2b", round: 2, playerId: "C", opponentId: "B", result: MatchResult.LOSS, gameWins: 1, gameLosses: 2, gameDraws: 0 },

      { id: "m3a", round: 3, playerId: "C", opponentId: "A", result: MatchResult.DRAW, gameWins: 1, gameLosses: 1, gameDraws: 1 },
      { id: "m3b", round: 3, playerId: "A", opponentId: "C", result: MatchResult.DRAW, gameWins: 1, gameLosses: 1, gameDraws: 1 },
    ];

    // Single-entry equivalent
    const single: Match[] = [
      { id: "s1", round: 1, playerId: "A", opponentId: "B", result: MatchResult.WIN,  gameWins: 2, gameLosses: 0, gameDraws: 0 },
      { id: "s2", round: 2, playerId: "B", opponentId: "C", result: MatchResult.WIN,  gameWins: 2, gameLosses: 1, gameDraws: 0 },
      { id: "s3", round: 3, playerId: "C", opponentId: "A", result: MatchResult.DRAW, gameWins: 1, gameLosses: 1, gameDraws: 1 },
    ];

    const rFull = computeRoundRobinStandings(mirrored, { eventId: "RR-SE-3" });
    const rSE   = computeRoundRobinStandings(single,   { eventId: "RR-SE-3", acceptSingleEntryMatches: true });

    // Compare by (playerId → compact projection) to avoid tolerance noise
    const proj = (rows: ReturnType<typeof computeRoundRobinStandings>) =>
      rows.map(r => ({
        id: r.playerId,
        MP: r.matchPoints,
        OMW: +r.omwp.toFixed(6),
        GWP: +r.gwp.toFixed(6),
        OGW: +r.ogwp.toFixed(6),
        SB:  +r.sb.toFixed(6),
      })).sort((a,b) => a.id.localeCompare(b.id));

    expect(proj(rSE)).toEqual(proj(rFull));
  });

  it("seeded fallback remains deterministic with single-entry data", () => {
    // Create a perfect tie that requires seeded fallback.
    // A, B, C all draw each other (single-entry only).
    const matches: Match[] = [
      { id: "d1", round: 1, playerId: "A", opponentId: "B", result: MatchResult.DRAW, gameWins: 1, gameLosses: 1, gameDraws: 1 },
      { id: "d2", round: 2, playerId: "B", opponentId: "C", result: MatchResult.DRAW, gameWins: 1, gameLosses: 1, gameDraws: 1 },
      { id: "d3", round: 3, playerId: "C", opponentId: "A", result: MatchResult.DRAW, gameWins: 1, gameLosses: 1, gameDraws: 1 },
    ];

    const r1 = computeRoundRobinStandings(matches, { eventId: "RR-SE-SEED", acceptSingleEntryMatches: true });
    const r2 = computeRoundRobinStandings(matches, { eventId: "RR-SE-SEED", acceptSingleEntryMatches: true });

    // Deterministic for the same seed:
    expect(r1.map(x => x.playerId)).toEqual(r2.map(x => x.playerId));
    // And stable ranks:
    expect(r1.map(x => x.rank)).toEqual(r2.map(x => x.rank));
  });
});
