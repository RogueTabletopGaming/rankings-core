// src/ratings/elo.ts
import type { PlayerID } from '../standings/types';
import {
  type EloMatch,
  type EloOptions,
  type EloUpdateResult,
  DEFAULT_RATING,
} from './types';

// ----------------------
// Optional WASM bridge
// ----------------------
type RatingsWasm = {
  expectedScore: (rA: number, rB: number) => number;
};

let _wasm: Promise<RatingsWasm> | null = null;
async function getWasm(): Promise<RatingsWasm> {
  if (!_wasm) {
    // Adjust this path to wherever your wasm bridge lives
    _wasm = import('../wasm/wasm-bridge').then((m: any) => m.getWasm());
  }
  return _wasm;
}

// Export the type here for convenience if tests import from this path
export type { EloMatch } from './types';

// ---------------------------------------
// Expected score (sync) — public default
// ---------------------------------------
export function expectedScore(rA: number, rB: number): number {
  // 1 / (1 + 10^((Rb - Ra)/400))
  return 1 / (1 + Math.pow(10, (rB - rA) / 400));
}

// Async WASM-accelerated version (opt-in)
export async function expectedScoreAsync(rA: number, rB: number): Promise<number> {
  try {
    const wasm = await getWasm();
    return wasm.expectedScore(rA, rB);
  } catch {
    return expectedScore(rA, rB);
  }
}

// ----------------------
// Core ELO update (sync)
// ----------------------
export function updateEloRatings(
  base: Readonly<Record<PlayerID, number>>,
  matches: ReadonlyArray<EloMatch>,
  options?: EloOptions
): EloUpdateResult {
  const {
    K = 32,
    KDraw = K,
    perPlayerK = {},
    initialRating = DEFAULT_RATING,
    floor,
    cap,
    mode = 'sequential',
    drawScore = 0.5,
  } = options ?? {};

  const ratings: Record<PlayerID, number> = { ...base };
  const deltas: Record<PlayerID, number> = Object.create(null);

  const getR = (id: PlayerID): number =>
    (ratings[id] ?? base[id] ?? initialRating);

  const apply = (id: PlayerID, delta: number) => {
    const before = ratings[id] ?? initialRating;
    let after = before + delta;
    if (floor !== undefined) after = Math.max(floor, after);
    if (cap   !== undefined) after = Math.min(cap, after);
    ratings[id] = after;
    deltas[id] = (deltas[id] ?? 0) + delta;
  };

  const scoreOfA = (result: EloMatch['result']): number =>
    result === 'A' ? 1 : result === 'B' ? 0 : drawScore;

  if (mode === 'sequential') {
    for (const m of matches) {
      const Ra = getR(m.a);
      const Rb = getR(m.b);

      const Ea = expectedScore(Ra, Rb);
      const Eb = 1 - Ea;

      const Sa = scoreOfA(m.result);
      const Sb = 1 - Sa;

      const baseK = (m.result === 'draw') ? KDraw : K;
      const K_a = perPlayerK[m.a] ?? baseK;
      const K_b = perPlayerK[m.b] ?? baseK;

      const w = m.weight ?? 1;

      apply(m.a, w * K_a * (Sa - Ea));
      apply(m.b, w * K_b * (Sb - Eb));
    }
  } else {
    // simultaneous: snapshot so order within batch doesn't matter
    const snap: Record<PlayerID, number> = { ...ratings };
    const getSnap = (id: PlayerID): number =>
      (snap[id] ?? base[id] ?? initialRating);

    for (const m of matches) {
      const Ra = getSnap(m.a);
      const Rb = getSnap(m.b);

      const Ea = expectedScore(Ra, Rb);
      const Eb = 1 - Ea;

      const Sa = scoreOfA(m.result);
      const Sb = 1 - Sa;

      const baseK = (m.result === 'draw') ? KDraw : K;
      const K_a = perPlayerK[m.a] ?? baseK;
      const K_b = perPlayerK[m.b] ?? baseK;

      const w = m.weight ?? 1;

      apply(m.a, w * K_a * (Sa - Ea));
      apply(m.b, w * K_b * (Sb - Eb));
    }
  }

  return { mode: 'elo', ratings, deltas };
}

// ---------------------------------
// Optional async WASM-accelerated API
// ---------------------------------
export async function updateEloRatingsWasm(
  base: Readonly<Record<PlayerID, number>>,
  matches: ReadonlyArray<EloMatch>,
  options?: EloOptions
): Promise<EloUpdateResult> {
  const {
    K = 32,
    KDraw = K,
    perPlayerK = {},
    initialRating = DEFAULT_RATING,
    floor,
    cap,
    mode = 'sequential',
    drawScore = 0.5,
  } = options ?? {};

  let wasmFn: ((a: number, b: number) => number) | null = null;
  try {
    const wasm = await getWasm();
    wasmFn = wasm.expectedScore;
  } catch {
    // fallback handled below
  }

  const expected = (a: number, b: number) =>
    wasmFn ? wasmFn(a, b) : expectedScore(a, b);

  const ratings: Record<PlayerID, number> = { ...base };
  const deltas: Record<PlayerID, number> = Object.create(null);

  const getR = (id: PlayerID): number =>
    (ratings[id] ?? base[id] ?? initialRating);

  const apply = (id: PlayerID, delta: number) => {
    const before = ratings[id] ?? initialRating;
    let after = before + delta;
    if (floor !== undefined) after = Math.max(floor, after);
    if (cap   !== undefined) after = Math.min(cap, after);
    ratings[id] = after;
    deltas[id] = (deltas[id] ?? 0) + delta;
  };

  const scoreOfA = (result: EloMatch['result']): number =>
    result === 'A' ? 1 : result === 'B' ? 0 : drawScore;

  if (mode === 'sequential') {
    for (const m of matches) {
      const Ra = getR(m.a);
      const Rb = getR(m.b);

      const Ea = expected(Ra, Rb);
      const Eb = 1 - Ea;

      const Sa = scoreOfA(m.result);
      const Sb = 1 - Sa;

      const baseK = (m.result === 'draw') ? KDraw : K;
      const K_a = perPlayerK[m.a] ?? baseK;
      const K_b = perPlayerK[m.b] ?? baseK;

      const w = m.weight ?? 1;

      apply(m.a, w * K_a * (Sa - Ea));
      apply(m.b, w * K_b * (Sb - Eb));
    }
  } else {
    const snap: Record<PlayerID, number> = { ...ratings };
    const getSnap = (id: PlayerID): number =>
      (snap[id] ?? base[id] ?? initialRating);

    for (const m of matches) {
      const Ra = getSnap(m.a);
      const Rb = getSnap(m.b);

      const Ea = expected(Ra, Rb);
      const Eb = 1 - Ea;

      const Sa = scoreOfA(m.result);
      const Sb = 1 - Sa;

      const baseK = (m.result === 'draw') ? KDraw : K;
      const K_a = perPlayerK[m.a] ?? baseK;
      const K_b = perPlayerK[m.b] ?? baseK;

      const w = m.weight ?? 1;

      apply(m.a, w * K_a * (Sa - Ea));
      apply(m.b, w * K_b * (Sb - Eb));
    }
  }

  return { mode: 'elo', ratings, deltas };
}
