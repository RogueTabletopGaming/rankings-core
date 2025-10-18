import { describe, it, expect } from "vitest";
import { updateEloRatings, expectedScore, type EloMatch } from "../../src/ratings";


// helper to assert defined keys
const must = (m: Record<string, number>, k: string): number => {
  const v = m[k];
  if (v === undefined) throw new Error(`Missing key ${k} in ratings`);
  return v;
};

describe("ELO – basics", () => {
  it("expectedScore symmetry & bounds", () => {
    const rA = 1600, rB = 1400;
    const eA = expectedScore(rA, rB);
    const eB = expectedScore(rB, rA);
    expect(eA + eB).toBeCloseTo(1, 10);
    expect(eA).toBeGreaterThan(0.5);
    expect(eB).toBeLessThan(0.5);
  });

  it("win/loss updates in opposite directions", () => {
    const matches: ReadonlyArray<EloMatch> = [{ a: "A", b: "B", result: "A" }];
    const { ratings } = updateEloRatings({}, matches, { K: 24, initialRating: 1500 });
    expect(must(ratings, "A")).toBeGreaterThan(1500);
    expect(must(ratings, "B")).toBeLessThan(1500);
  });

  it("draw moves stronger player down and weaker up (unequal ratings)", () => {
    const { ratings } = updateEloRatings(
      { A: 1600, B: 1400 },
      [{ a: "A", b: "B", result: "draw" }],
      { K: 24 }
    );
    expect(must(ratings, "A")).toBeLessThan(1600);
    expect(must(ratings, "B")).toBeGreaterThan(1400);
  });
});

describe("ELO – options", () => {
  it("respects initialRating for new players", () => {
    const { ratings } = updateEloRatings(
      {},
      [{ a: "X", b: "Y", result: "A" }],
      { initialRating: 1200, K: 32 }
    );
    expect(must(ratings, "X")).toBeGreaterThan(1200);
    expect(must(ratings, "Y")).toBeLessThan(1200);
  });

  it("applies floor & cap", () => {
    const base = { A: 2500, B: 1000 };
    const { ratings } = updateEloRatings(
      base,
      [{ a: "A", b: "B", result: "B" }],
      { K: 400, floor: 900, cap: 2550 }
    );
    expect(must(ratings, "A")).toBeLessThanOrEqual(2550);
    expect(must(ratings, "B")).toBeGreaterThanOrEqual(900);
  });

  it("per-player K overrides and KDraw", () => {
    // ---- KDraw smaller movement on draw with unequal ratings ----
    const baseDraw = { A: 1600, B: 1400 };
    const { ratings: rKDraw8 }  = updateEloRatings(baseDraw, [{ a: "A", b: "B", result: "draw" }], { K: 32, KDraw: 8 });
    const { ratings: rKDraw32 } = updateEloRatings(baseDraw, [{ a: "A", b: "B", result: "draw" }], { K: 32 });

    const moveA_8  = Math.abs(must(rKDraw8,  "A") - baseDraw.A);
    const moveA_32 = Math.abs(must(rKDraw32, "A") - baseDraw.A);
    const moveB_8  = Math.abs(must(rKDraw8,  "B") - baseDraw.B);
    const moveB_32 = Math.abs(must(rKDraw32, "B") - baseDraw.B);

    expect(moveA_8).toBeLessThan(moveA_32);
    expect(moveB_8).toBeLessThan(moveB_32);

    // ---- per-player K: provisional player moves more on a win ----
    const baseWin = { C: 1500, D: 1500 };
    const matchWin: ReadonlyArray<EloMatch> = [{ a: "C", b: "D", result: "A" }];

    const { ratings: rK24 } = updateEloRatings(baseWin, matchWin, { K: 24 });
    const { ratings: rK48 } = updateEloRatings(baseWin, matchWin, { K: 24, perPlayerK: { C: 48 } });

    const deltaC_24 = must(rK24, "C") - baseWin.C;
    const deltaC_48 = must(rK48, "C") - baseWin.C;

    expect(deltaC_48).toBeGreaterThan(deltaC_24);
  });

  it("weight scales the update magnitude", () => {
    const m: EloMatch = { a: "A", b: "B", result: "A" };
    const { ratings: rW0 } = updateEloRatings(
      { A: 1500, B: 1500 },
      [{ ...m, weight: 0 }],
      { K: 32 }
    );
    const { ratings: rW05 } = updateEloRatings(
      { A: 1500, B: 1500 },
      [{ ...m, weight: 0.5 }],
      { K: 32 }
    );
    const { ratings: rW1 } = updateEloRatings(
      { A: 1500, B: 1500 },
      [{ ...m, weight: 1 }],
      { K: 32 }
    );

    expect(must(rW0, "A")).toBe(1500);
    expect(must(rW0, "B")).toBe(1500);
    expect(must(rW1, "A") - 1500).toBeGreaterThan(must(rW05, "A") - 1500);
  });

  it("custom drawScore changes the deltas on draw", () => {
    const base = { A: 1600, B: 1400 };
    const m: ReadonlyArray<EloMatch> = [{ a: "A", b: "B", result: "draw" }];

    const r05 = updateEloRatings(base, m, { K: 32, drawScore: 0.5 }).ratings;
    const r06 = updateEloRatings(base, m, { K: 32, drawScore: 0.6 }).ratings;

    const moveA05 = Math.abs(must(r05, "A") - base.A);
    const moveA06 = Math.abs(must(r06, "A") - base.A);
    const moveB05 = Math.abs(must(r05, "B") - base.B);
    const moveB06 = Math.abs(must(r06, "B") - base.B);

    expect(moveA05).not.toEqual(moveA06);
    expect(moveB05).not.toEqual(moveB06);
  });
});

describe("ELO – sequential vs simultaneous", () => {
  it("simultaneous applies all deltas from snapshot (order-independent within the batch)", () => {
    const matches: ReadonlyArray<EloMatch> = [
      { a: "A", b: "B", result: "A" }, // A beats B
      { a: "A", b: "C", result: "B" }, // C (the b player) beats A
    ];
    const base = { A: 1500, B: 1500, C: 1500 };

    const seq = updateEloRatings(base, matches, { K: 32, mode: "sequential" });
    const sim = updateEloRatings(base, matches, { K: 32, mode: "simultaneous" });

    // Both valid, typically different numbers
    expect(must(seq.ratings, "A")).not.toEqual(must(sim.ratings, "A"));

    // Simultaneous result should be identical regardless of match order:
    const sim2 = updateEloRatings(base, [...matches].reverse(), { K: 32, mode: "simultaneous" });
    expect(sim.ratings).toEqual(sim2.ratings);
  });

  it("floor/cap enforced in both modes", () => {
    const base = { A: 2500, B: 1000 };
    const mm: ReadonlyArray<EloMatch> = [{ a: "A", b: "B", result: "B" }];

    const seq = updateEloRatings(base, mm, { K: 400, floor: 900, cap: 2550, mode: "sequential" }).ratings;
    const sim = updateEloRatings(base, mm, { K: 400, floor: 900, cap: 2550, mode: "simultaneous" }).ratings;

    expect(must(seq, "A")).toBeLessThanOrEqual(2550);
    expect(must(seq, "B")).toBeGreaterThanOrEqual(900);
    expect(must(sim, "A")).toBeLessThanOrEqual(2550);
    expect(must(sim, "B")).toBeGreaterThanOrEqual(900);
  });
});

describe("ELO – readonly & immutability", () => {
  it("accepts ReadonlyArray<EloMatch> and does not mutate inputs", () => {
    const base = Object.freeze({ A: 1500, B: 1500 });
    const matches = Object.freeze([{ a: "A", b: "B", result: "A" }] as const);

    const { ratings } = updateEloRatings(base, matches, { K: 32 });

    // input objects remain frozen/unchanged
    expect(Object.isFrozen(base)).toBe(true);
    expect(Object.isFrozen(matches)).toBe(true);
    expect(base.A).toBe(1500);
    expect(base.B).toBe(1500);

    // output ratings changed appropriately
    expect(must(ratings, "A")).toBeGreaterThan(1500);
    expect(must(ratings, "B")).toBeLessThan(1500);
  });

  it("perPlayerK applies only to the specified player", () => {
    const base = { A: 1500, B: 1500 };
    const m: ReadonlyArray<EloMatch> = [{ a: "A", b: "B", result: "A" }];

    const rNone = updateEloRatings(base, m, { K: 24 }).ratings;
    const rOnlyA = updateEloRatings(base, m, { K: 24, perPlayerK: { A: 48 } }).ratings;
    const rOnlyB = updateEloRatings(base, m, { K: 24, perPlayerK: { B: 48 } }).ratings;

    expect(must(rOnlyA, "A") - 1500).toBeGreaterThan(must(rNone, "A") - 1500);
    expect(1500 - must(rOnlyB, "B")).toBeGreaterThan(1500 - must(rNone, "B"));
  });

  it("uses initialRating for unseen players and does not mutate input ratings", () => {
    const input = Object.freeze({ A: 1600 }); // B is unseen
    const m: ReadonlyArray<EloMatch> = [{ a: "A", b: "B", result: "B" }];

    const { ratings } = updateEloRatings(input, m, { initialRating: 1200, K: 32 });

    expect(must(ratings, "B")).toBeDefined();
    expect(must(ratings, "B")).toBeGreaterThan(1200); // B won vs higher-rated A
    expect(input).toEqual({ A: 1600 }); // unchanged
  });
});
