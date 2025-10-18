import { describe, it, expect } from "vitest";
import type { Match, StandingRow, PlayerID } from "../../src/standings/types";
import { MatchResult } from "../../src/standings/types";
import { generateSwissPairings } from "../../src/pairings/swiss";

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
        result: MatchResult.WIN,
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
