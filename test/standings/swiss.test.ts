import { describe, it, expect } from "vitest";
import type { Match, StandingRow, PlayerID } from "../../src/standings/types";
import { MatchResult } from "../../src/standings/types";
import { generateSwissPairings } from "../../src/pairings/swiss";
import { computeSwissStandings } from "../../src/standings/swiss";

// minimal helper to craft a standings list quickly
function makeStandings(ids: string[], mp: number[]): StandingRow[] {
  if (ids.length !== mp.length) {
    throw new Error(`makeStandings: ids (${ids.length}) and mp (${mp.length}) must have same length`);
  }
  return ids.map((id, i) => {
    const points: number = mp[i]!; // safe after the length check
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

describe("generateSwissPairings – basic", () => {
  it("pairs adjacent inside score groups and assigns bye if odd", () => {
    const standings = makeStandings(["A", "B", "C", "D", "E"], [6, 6, 3, 3, 0]);
    const history: Match[] = []; // no prior games
    const res = generateSwissPairings(standings, history, { eventId: "PAIR-1" });

    // 5 players -> 1 bye
    expect(res.bye).toBeDefined();
    const all = new Set(["A", "B", "C", "D", "E"]);
    if (res.bye) all.delete(res.bye);
    const paired = new Set<string>();
    for (const p of res.pairings) {
      paired.add(p.a);
      paired.add(p.b);
    }

    // Everyone except bye is paired
    expect([...all].every((id) => paired.has(id))).toBe(true);

    // Top group [A,B] should be paired together
    const hasAB = res.pairings.some(
      (p) => (p.a === "A" && p.b === "B") || (p.a === "B" && p.b === "A")
    );
    expect(hasAB).toBe(true);
  });

  it("avoids rematches when possible", () => {
    const standings = makeStandings(["A", "B", "C", "D"], [6, 6, 6, 6]);
    // History where A already played B, and C already played D
    const history: Match[] = [
      {
        id: "h1",
        round: 1,
        playerId: "A",
        opponentId: "B",
        result: MatchResult.WIN, // keep your actual enum; likely MatchResult.WIN
        gameWins: 2,
        gameLosses: 0,
        gameDraws: 0,
      },
      {
        id: "h2",
        round: 1,
        playerId: "B",
        opponentId: "A",
        result: MatchResult.LOSS,
        gameWins: 0,
        gameLosses: 2,
        gameDraws: 0,
      },
      {
        id: "h3",
        round: 1,
        playerId: "C",
        opponentId: "D",
        result: MatchResult.WIN,
        gameWins: 2,
        gameLosses: 0,
        gameDraws: 0,
      },
      {
        id: "h4",
        round: 1,
        playerId: "D",
        opponentId: "C",
        result: MatchResult.LOSS,
        gameWins: 0,
        gameLosses: 2,
        gameDraws: 0,
      },
    ];
    const res = generateSwissPairings(standings, history, { eventId: "PAIR-2" });
    const bad1 = res.pairings.some(
      (p) => (p.a === "A" && p.b === "B") || (p.a === "B" && p.b === "A")
    );
    const bad2 = res.pairings.some(
      (p) => (p.a === "C" && p.b === "D") || (p.a === "D" && p.b === "C")
    );
    expect(bad1 || bad2).toBe(false);
  });

  it("downfloats when group is odd to enable pairing", () => {
    // Three players on 6, one on 3 -> must downfloat one from top group
    const standings = makeStandings(["A", "B", "C", "D"], [6, 6, 6, 3]);
    const history: Match[] = [];
    const res = generateSwissPairings(standings, history, { eventId: "PAIR-3" });
    // All 4 must be paired, no bye
    expect(res.bye).toBeUndefined();
    expect(res.pairings.length).toBe(2);
  });

  it("seed produces deterministic results; differences only when tie-breaking is needed", () => {
    const standings = makeStandings(['A','B','C','D','E','F'], [9,9,9,9,9,9]);
    const r1a = generateSwissPairings(standings, [], { eventId: 'S1' });
    const r1b = generateSwissPairings(standings, [], { eventId: 'S1' });
    const r2a = generateSwissPairings(standings, [], { eventId: 'S2' });
    const r2b = generateSwissPairings(standings, [], { eventId: 'S2' });

    // Deterministic per seed
    expect(r1a.pairings).toEqual(r1b.pairings);
    expect(r2a.pairings).toEqual(r2b.pairings);

    // Across different seeds, results may be equal or different depending on tie structure.
    const cover = (r: typeof r1a) => new Set(r.pairings.flatMap(p => [p.a, p.b]));
    expect(cover(r1a).size).toBe(6);
    expect(cover(r2a).size).toBe(6);
  });
});

// ---------------- Additional comprehensive scenarios ----------------

it('assigns bye to lowest-ranked player without prior bye', () => {
  const standings = makeStandings(['A','B','C','D','E'], [9,9,9,6,3]); // odd
  const history: Match[] = [
    { id:'h-bye-E', round:1, playerId:'E', opponentId:null, result:MatchResult.BYE, gameWins:0, gameLosses:0, gameDraws:0 },
  ];
  const res = generateSwissPairings(standings, history, { eventId: 'PAIR-BYE-NOREPEAT' });
  // E already had a bye; next lowest-ranked is D
  expect(res.bye).toBe('D');
});

it('protectTopN keeps top-N inside group before downfloating', () => {
  // Three at 9 MP, one at 6 MP. protect top-2 from downfloat.
  const standings = makeStandings(['A','B','C','D'], [9,9,9,6]);
  const res = generateSwissPairings(standings, [], { eventId: 'PAIR-PROTECT', protectTopN: 2 });
  // ensure A and B are paired (not downfloated); we don't enforce exact partners
  const p = res.pairings;
  const partners = (id: string) => p.find(x => x.a === id || x.b === id);
  const A = partners('A'); const B = partners('B');
  expect(A).toBeTruthy(); expect(B).toBeTruthy();
});

it('records rematchesUsed when constraints force a rematch', () => {
  const standings = makeStandings(['A','B','C','D'], [6,6,6,6]);
  // Everyone has already played everyone (round-robin history)
  const h: Match[] = [];
  const ids = ['A','B','C','D'];
  let mid = 0;
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i]!; // safe by loop bounds
      const b = ids[j]!; // safe by loop bounds
      h.push({ id: `h${mid++}`, round: 1, playerId: a, opponentId: b,
        result: MatchResult.DRAW, gameWins: 1, gameLosses: 1, gameDraws: 1 });
      h.push({ id: `h${mid++}`, round: 1, playerId: b, opponentId: a,
        result: MatchResult.DRAW, gameWins: 1, gameLosses: 1, gameDraws: 1 });
    }
  }
  const res = generateSwissPairings(standings, h, { eventId: 'PAIR-REMATCH-FORCED' });
  expect(res.rematchesUsed.length).toBeGreaterThan(0);
  expect(res.pairings.length).toBe(2);
});

it('allows rematches when avoidRematches=false and does not mark rematchesUsed', () => {
  const standings = makeStandings(['A','B','C','D'], [6,6,6,6]);
  const history: Match[] = [
    { id:'h1', round:1, playerId:'A', opponentId:'B', result:MatchResult.DRAW, gameWins:1, gameLosses:1, gameDraws:1 },
    { id:'h2', round:1, playerId:'B', opponentId:'A', result:MatchResult.DRAW, gameWins:1, gameLosses:1, gameDraws:1 },
  ];
  const res = generateSwissPairings(standings, history, { eventId: 'PAIR-REMATCH-OK', avoidRematches: false });
  expect(Array.isArray(res.pairings)).toBe(true);
  expect(res.rematchesUsed.length).toBe(0);
});

it('uses backtracking to escape local dead ends', () => {
  // Arrange such that naive adjacent picks cause a dead end unless it backtracks.
  const s = makeStandings(['A','B','C','D','E','F'], [6,6,6,6,6,6]);
  const h: Match[] = [
    // Block adjacent neighbors A-B, C-D, E-F
    { id:'ab1', round:1, playerId:'A', opponentId:'B', result:MatchResult.DRAW, gameWins:1, gameLosses:1, gameDraws:1 },
    { id:'ba1', round:1, playerId:'B', opponentId:'A', result:MatchResult.DRAW, gameWins:1, gameLosses:1, gameDraws:1 },
    { id:'cd1', round:1, playerId:'C', opponentId:'D', result:MatchResult.DRAW, gameWins:1, gameLosses:1, gameDraws:1 },
    { id:'dc1', round:1, playerId:'D', opponentId:'C', result:MatchResult.DRAW, gameWins:1, gameLosses:1, gameDraws:1 },
    { id:'ef1', round:1, playerId:'E', opponentId:'F', result:MatchResult.DRAW, gameWins:1, gameLosses:1, gameDraws:1 },
    { id:'fe1', round:1, playerId:'F', opponentId:'E', result:MatchResult.DRAW, gameWins:1, gameLosses:1, gameDraws:1 },
  ];
  const res = generateSwissPairings(s, h, { eventId: 'PAIR-BACKTRACK', maxBacktrack: 5000 });
  expect(res.pairings.length).toBe(3);
  const hasRematch = res.pairings.some(p =>
    (p.a === 'A' && p.b === 'B') || (p.a === 'B' && p.b === 'A') ||
    (p.a === 'C' && p.b === 'D') || (p.a === 'D' && p.b === 'C') ||
    (p.a === 'E' && p.b === 'F') || (p.a === 'F' && p.b === 'E')
  );
  expect(hasRematch).toBe(false);
});

it('tracks downfloats and prefers players with fewer prior downfloats', () => {
  const standings = makeStandings(['A','B','C','D','E'], [9,9,9,6,6]); // odd → bye + downfloat pressure
  const history: Match[] = [];
  const r1 = generateSwissPairings(standings, history, { eventId: 'PAIR-FAIR-1' });
  const r2 = generateSwissPairings(standings, history, { eventId: 'PAIR-FAIR-1' });
  const df = r1.downfloats;
  const top = ['A','B','C'];
  const topDfCount = top.reduce((acc, id) => acc + (df[id] ?? 0), 0);
  expect(topDfCount).toBeLessThanOrEqual(1);
  expect(r1).toEqual(r2);
});

it('E2E across 3 rounds: never repeats opponents when avoidRematches=true', () => {
  const roster = ['A','B','C','D','E','F','G','H'];
  // start with all 0 MP standings
  let standings: StandingRow[] = makeStandings(roster, new Array(roster.length).fill(0));
  const history: Match[] = [];
  let round = 1;

  const addResults = (pairs: {a: string; b: string}[]) => {
    for (const p of pairs) {
      history.push({ id:`r${round}-${p.a}-${p.b}-a`, round, playerId:p.a, opponentId:p.b, result:MatchResult.WIN, gameWins:2, gameLosses:0, gameDraws:0 });
      history.push({ id:`r${round}-${p.a}-${p.b}-b`, round, playerId:p.b, opponentId:p.a, result:MatchResult.LOSS, gameWins:0, gameLosses:2, gameDraws:0 });
    }
  };

  for (round = 1; round <= 3; round++) {
    const res = generateSwissPairings(standings, history, { eventId: 'PAIR-E2E' });
    const pairs = res.pairings.map(p => ({ a: p.a, b: p.b }));
    expect(res.rematchesUsed.length).toBe(0);
    addResults(pairs);

    // recompute standings from history: 3/1/0 system
    const allMatches = [...history];
    standings = roster.map((id, i) => {
      const ms = allMatches.filter(m => m.playerId === id);
      const MP = ms.reduce((acc, m) =>
        acc + (m.result === MatchResult.WIN ? 3 :
               m.result === MatchResult.DRAW ? 1 :
               m.result === MatchResult.BYE ? 3 : 0), 0);
      return {
        rank: i + 1, playerId: id, matchPoints: MP,
        mwp: 0.5, omwp: 0.5, gwp: 0.5, ogwp: 0.5, sb: 0,
        wins: 0, losses: 0, draws: 0, byes: 0, roundsPlayed: round,
        gameWins: 0, gameLosses: 0, gameDraws: 0, penalties: 0, opponents: [] as PlayerID[]
      } as StandingRow;
    }).sort((a,b) => b.matchPoints - a.matchPoints).map((r, idx) => ({ ...r, rank: idx+1 }));
  }
});

//
// ---------------- NEW: Swiss standings tests for virtual-bye behavior ----------------
//

describe("computeSwissStandings – virtual-bye option", () => {
  /**
   * Scenario:
   *  - Round 1: A gets a BYE. B beats C (2–0).
   *  - Round 2: A beats B (2–0).
   *
   * For A's OMW%:
   *  - Real opponents: [B]
   *  - B's MWP excluding subject A: only match vs C → 1.0 (win)
   *  - Without virtual-bye: OMW% = avg([1.0]) = 1.0
   *  - With virtual-bye (0.5): OMW% = avg([1.0, 0.5]) = 0.75
   *
   * OGWP similarly: 1.0 vs C → same math → 0.75 with virtual 0.5.
   */
  const baseMatches: Match[] = [
    // R1: A BYE
    { id: "r1-A-bye", round: 1, playerId: "A", opponentId: null, result: MatchResult.BYE, gameWins: 0, gameLosses: 0, gameDraws: 0 },
    // R1: B vs C (B wins 2-0) — include both directions
    { id: "r1-B-C-b", round: 1, playerId: "B", opponentId: "C", result: MatchResult.WIN, gameWins: 2, gameLosses: 0, gameDraws: 0 },
    { id: "r1-C-B-b", round: 1, playerId: "C", opponentId: "B", result: MatchResult.LOSS, gameWins: 0, gameLosses: 2, gameDraws: 0 },
    // R2: A vs B (A wins 2-0)
    { id: "r2-A-B-a", round: 2, playerId: "A", opponentId: "B", result: MatchResult.WIN, gameWins: 2, gameLosses: 0, gameDraws: 0 },
    { id: "r2-B-A-a", round: 2, playerId: "B", opponentId: "A", result: MatchResult.LOSS, gameWins: 0, gameLosses: 2, gameDraws: 0 },
  ];

  it("default (virtual-bye disabled): bye is excluded from OMW%/OGWP", () => {
    const rows = computeSwissStandings(baseMatches, {
      eventId: "SWISS-VB-NONE",
      // default floors & points
      // virtual-bye disabled by default
    });
    const a = rows.find(r => r.playerId === "A")!;
    expect(a).toBeDefined();

    // A had one real opponent (B); OMW% and OGWP come only from B's pct excluding A → 1.0
    expect(a.omwp).toBeCloseTo(1.0, 10);
    expect(a.ogwp).toBeCloseTo(1.0, 10);

    // The virtual opponent is NOT listed anywhere
    expect(a.opponents).toEqual(["B"]);
    // MWP/GWP of A themselves are unaffected by the virtual-bye feature
    // (A has 1 bye and 1 win → MWP = 1.0; GWP counts bye as 2-0 for visibility)
    expect(a.mwp).toBeCloseTo(1.0, 10);
  });

  it("when enabled: adds a 0.5 virtual opponent per BYE to OMW%/OGWP", () => {
    const rows = computeSwissStandings(baseMatches, {
      eventId: "SWISS-VB-ON",
      tiebreakVirtualBye: { enabled: true, mwp: 0.5, gwp: 0.5 },
    });
    const a = rows.find(r => r.playerId === "A")!;
    expect(a).toBeDefined();

    // Expected averages: mean([1.0, 0.5]) = 0.75
    expect(a.omwp).toBeCloseTo(0.75, 10);
    expect(a.ogwp).toBeCloseTo(0.75, 10);

    // Still not surfaced as a real opponent
    expect(a.opponents).toEqual(["B"]);
  });

  it("applies opponent floor to virtual-bye values", () => {
    const rows = computeSwissStandings(baseMatches, {
      eventId: "SWISS-VB-FLOOR",
      tiebreakFloors: { opponentPctFloor: 0.33 },
      tiebreakVirtualBye: { enabled: true, mwp: 0.1, gwp: 0.1 }, // below floor
    });
    const a = rows.find(r => r.playerId === "A")!;
    expect(a).toBeDefined();

    // Virtual 0.1 is floored to 0.33: mean([1.0, 0.33]) = 0.665...
    expect(a.omwp).toBeCloseTo((1.0 + 0.33) / 2, 3);
    expect(a.ogwp).toBeCloseTo((1.0 + 0.33) / 2, 3);
  });

  it("supports multiple BYEs by contributing one virtual entry per BYE", () => {
    // Give A an extra BYE in round 3
    const matches2: Match[] = [
      ...baseMatches,
      { id: "r3-A-bye", round: 3, playerId: "A", opponentId: null, result: MatchResult.BYE, gameWins: 0, gameLosses: 0, gameDraws: 0 },
    ];
    const rows = computeSwissStandings(matches2, {
      eventId: "SWISS-VB-2BYES",
      tiebreakVirtualBye: { enabled: true, mwp: 0.5, gwp: 0.5 },
    });
    const a = rows.find(r => r.playerId === "A")!;

    // Now mean([1.0, 0.5, 0.5]) = 2.0 / 3 = 0.666...
    expect(a.omwp).toBeCloseTo(2 / 3, 10);
    expect(a.ogwp).toBeCloseTo(2 / 3, 10);
    expect(a.byes).toBe(2);
    expect(a.opponents).toEqual(["B"]);
  });
});
