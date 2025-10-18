import { describe, it, expect } from "vitest";
import {
  buildRoundRobinSchedule,
  getRoundRobinRound,
  type RoundDefinition,
} from "../../src/pairings/roundrobin";
import type { PlayerID } from "../../src/standings/types";

// ---------- helpers ----------

// Safe indexed access helper (throws if out of range)
function mustAt<T>(arr: readonly T[], i: number, label = "index"): T {
  const v = arr[i];
  if (v === undefined) throw new Error(`Out of range: ${label}=${i}`);
  return v;
}

const normPair = (a: PlayerID, b: PlayerID): string =>
  [a, b].sort().join("|");

const flattenPairs = (rounds: readonly RoundDefinition[]) =>
  rounds.flatMap((r) => r.pairings.map((p) => normPair(p.a, p.b)));

// ---------- tests ----------

describe("Round-robin – even player count", () => {
  it("n=4 → n-1=3 rounds, no byes, each unordered pair exactly once", () => {
    const players: PlayerID[] = ["A", "B", "C", "D"];
    const { rounds } = buildRoundRobinSchedule(players);

    expect(rounds.length).toBe(3);
    rounds.forEach((r) => {
      expect(r.byes.length).toBe(0);
      expect(r.pairings.length).toBe(2); // 4 players → 2 matches per round
    });

    const seen = new Set(flattenPairs(rounds));
    // For 4 players, total unordered pairs = 4*3/2 = 6
    expect(seen.size).toBe(6);

    const allPairs = flattenPairs(rounds);
    expect(allPairs.length).toBe(6);
    expect(new Set(allPairs).size).toBe(allPairs.length);
  });
});

describe("Round-robin – odd player count (includeBye default true)", () => {
  it("n=5 → add BYE → n'=6 → n'-1=5 rounds; one bye per round; each real player byes exactly once", () => {
    const players: PlayerID[] = ["A", "B", "C", "D", "E"];
    const { rounds } = buildRoundRobinSchedule(players);

    expect(rounds.length).toBe(5);

    rounds.forEach((r) => {
      expect(r.byes.length).toBe(1);
      expect(r.pairings.length).toBe(2);
    });

    const byeCount: Record<PlayerID, number> = { A: 0, B: 0, C: 0, D: 0, E: 0 };
    for (const r of rounds) {
      const b = mustAt(r.byes, 0, "round.byes");
      byeCount[b] = (byeCount[b] ?? 0) + 1;
    }
    for (const id of players) {
      expect(byeCount[id]).toBe(1);
    }

    const pairs = flattenPairs(rounds);
    expect(new Set(pairs).size).toBe(pairs.length);
  });

  it("includeBye=false throws on odd player list", () => {
    const players: PlayerID[] = ["A", "B", "C"];
    expect(() =>
      buildRoundRobinSchedule(players, { includeBye: false })
    ).toThrow();
  });
});

describe("Round-robin – deterministic shuffling", () => {
  it("shuffleSeed yields deterministic but different schedules for different seeds", () => {
    const players: PlayerID[] = ["A", "B", "C", "D", "E", "F"];
    const s1 = buildRoundRobinSchedule(players, { shuffleSeed: "seed-1" });
    const s1b = buildRoundRobinSchedule(players, { shuffleSeed: "seed-1" });
    const s2 = buildRoundRobinSchedule(players, { shuffleSeed: "seed-2" });

    // Same seed → identical
    expect(s1).toEqual(s1b);

    // Different seed → first round should differ typically
    expect(mustAt(s1.rounds, 0, "s1.rounds"))
      .not.toEqual(mustAt(s2.rounds, 0, "s2.rounds"));
  });

  it("no shuffleSeed → respects input order deterministically", () => {
    const p1: PlayerID[] = ["A", "B", "C", "D"];
    const p2: PlayerID[] = ["A", "B", "C", "D"];
    const s1 = buildRoundRobinSchedule(p1);
    const s2 = buildRoundRobinSchedule(p2);
    expect(s1).toEqual(s2);
  });
});

describe("Round-robin – double round-robin", () => {
  it("double=true mirrors second leg (swap home/away) and doubles rounds", () => {
    const players: PlayerID[] = ["A", "B", "C", "D"];
    const single = buildRoundRobinSchedule(players, { double: false });
    const dbl = buildRoundRobinSchedule(players, { double: true });

    expect(dbl.rounds.length).toBe(single.rounds.length * 2);

    // First leg equals single
    for (let i = 0; i < single.rounds.length; i++) {
      expect(mustAt(dbl.rounds, i, "dbl.rounds").pairings)
        .toEqual(mustAt(single.rounds, i, "single.rounds").pairings);
      expect(mustAt(dbl.rounds, i, "dbl.rounds").byes)
        .toEqual(mustAt(single.rounds, i, "single.rounds").byes);
    }

    // Second leg is mirrored: every {a,b} appears as {b,a} in same round offset
    const offset = single.rounds.length;
    for (let i = 0; i < single.rounds.length; i++) {
      const leg1 = mustAt(single.rounds, i, "single.rounds").pairings;
      const leg2 = mustAt(dbl.rounds, offset + i, "dbl.rounds").pairings;
      const mirroredOK = leg1.every((p, idx) => {
        const q = mustAt(leg2, idx, "dbl.rounds[mirrored].pairings");
        return p.a === q.b && p.b === q.a;
      });
      expect(mirroredOK).toBe(true);
    }

    // In a double RR with 4 players: each unordered pair occurs exactly twice overall
    const pairsDouble = flattenPairs(dbl.rounds);
    const counts: Record<string, number> = {};
    for (const key of pairsDouble) counts[key] = (counts[key] ?? 0) + 1;
    expect(Object.values(counts).every((c) => c === 2)).toBe(true);
  });
});

describe("Round-robin – getRoundRobinRound()", () => {
  it("returns a specific round; throws on out-of-range", () => {
    const players: PlayerID[] = ["A", "B", "C", "D"];
    const r1 = getRoundRobinRound(players, 1);
    expect(r1.round).toBe(1);
    expect(r1.pairings.length).toBe(2);
    expect(r1.byes.length).toBe(0);

    expect(() => getRoundRobinRound(players, 0)).toThrow();
    expect(() => getRoundRobinRound(players, 5)).toThrow(); // 4 players -> 3 rounds
  });

  it("works with odd player list (BYE inserted) and round indexing is 1-based", () => {
    const players: PlayerID[] = ["A", "B", "C", "D", "E"];
    const rd = getRoundRobinRound(players, 3); // should exist (total rounds = 5)
    expect(rd.round).toBe(3);
    expect(rd.byes.length).toBe(1);
  });
});

describe("Round-robin – structural invariants", () => {
  it("no self-pairings; each player appears at most once per round (even list)", () => {
    const players: PlayerID[] = ["A", "B", "C", "D", "E", "F"];
    const { rounds } = buildRoundRobinSchedule(players);

    for (const r of rounds) {
      const seen = new Set<PlayerID>();
      for (const p of r.pairings) {
        expect(p.a).not.toBe(p.b);
        expect(seen.has(p.a)).toBe(false);
        expect(seen.has(p.b)).toBe(false);
        seen.add(p.a);
        seen.add(p.b);
      }
      expect(seen.size).toBe(players.length);
    }
  });

  it("single RR with odd list: byes cover all players exactly once; pairs unique", () => {
    const players: PlayerID[] = ["A", "B", "C", "D", "E", "F", "G"];
    const { rounds } = buildRoundRobinSchedule(players);

    const byeCount: Record<PlayerID, number> = Object.fromEntries(players.map((p) => [p, 0]));
    for (const r of rounds) {
      expect(r.byes.length).toBe(1);
      const b = mustAt(r.byes, 0, "round.byes");
      byeCount[b] = (byeCount[b] ?? 0) + 1;
    }
    for (const id of players) expect(byeCount[id]).toBe(1);

    const pairs = flattenPairs(rounds);
    const counts: Record<string, number> = {};
    for (const key of pairs) counts[key] = (counts[key] ?? 0) + 1;

    const n = players.length;
    expect(Object.keys(counts).length).toBe((n * (n - 1)) / 2);
    expect(Object.values(counts).every((c) => c === 1)).toBe(true);
  });
});
