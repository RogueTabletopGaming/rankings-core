// src/roundrobin.ts
// --------------------------------------
// Round-robin pairings for rankings-core

import type { PlayerID } from "../standings/types";

export interface RoundRobinOptions {
  /**
   * Create a double round-robin (home/away). Default: false (single).
   */
  double?: boolean;
  /**
   * Deterministically shuffle player order by this seed before building the schedule.
   * If omitted, uses the input order as-is.
   */
  shuffleSeed?: string;
  /**
   * If true (default), insert a synthetic BYE when players.length is odd.
   * If false and players.length is odd, throws.
   */
  includeBye?: boolean;
}

export interface RoundDefinition {
  round: number; // 1-based
  pairings: { a: PlayerID; b: PlayerID }[];
  byes: PlayerID[]; // length 0 for even; 1 for odd
}

export interface RoundRobinSchedule {
  rounds: RoundDefinition[];
}

/** Internal: FNV-1a 32-bit hash */
function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

/** Internal: tiny PRNG */
function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** Internal: Fisher–Yates shuffle (in place) with deterministic RNG */
function shuffleInPlace<T>(arr: T[], seed: string): void {
  const rand = mulberry32(fnv1a(`rr::${seed}`));
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = arr[i]; arr[i] = arr[j] as T; arr[j] = tmp as T;
  }
}

/**
 * Build a full single/double round-robin schedule using the "circle method".
 * For odd-sized lists, a BYE is inserted (unless includeBye=false).
 */
export function buildRoundRobinSchedule(
  playersIn: ReadonlyArray<PlayerID>,
  options?: RoundRobinOptions
): RoundRobinSchedule {
  const {
    double = false,
    shuffleSeed,
    includeBye = true,
  } = options || {};

  if (playersIn.length < 2) {
    // Trivial cases
    const byes = playersIn.length === 1 ? [playersIn[0] as PlayerID] : [];
    return { rounds: [{ round: 1, pairings: [], byes }] };
    // (Empty set ⇒ one empty round for convenience)
  }

  // Copy & optionally shuffle deterministically
  const players: PlayerID[] = [...playersIn];
  if (shuffleSeed) shuffleInPlace(players, shuffleSeed);

  // Insert BYE if odd
  const ODD = players.length % 2 === 1;
  const BYE: PlayerID = "__BYE__";
  if (ODD) {
    if (!includeBye) {
      throw new Error("buildRoundRobinSchedule: odd number of players and includeBye=false");
    }
    players.push(BYE);
  }

  const n = players.length;       // even
  const roundsCount = n - 1;      // single RR has n-1 rounds
  const half = n / 2;

  // Circle method: fix index 0; rotate others clockwise each round
  let arr = [...players]; // working array
  const rounds: RoundDefinition[] = [];

  for (let r = 1; r <= roundsCount; r++) {
    const pairings: { a: PlayerID; b: PlayerID }[] = [];
    const byes: PlayerID[] = [];

    for (let i = 0; i < half; i++) {
      const a = arr[i] as PlayerID;
      const b = arr[n - 1 - i] as PlayerID;
      if (a === BYE || b === BYE) {
        byes.push(a === BYE ? b : a);
      } else {
        pairings.push({ a, b });
      }
    }

    rounds.push({ round: r, pairings, byes });

    // rotate indices 1..n-1 one step; arr[0] stays fixed
    const fixed = arr[0] as PlayerID;
    const tail = arr.slice(1);
    tail.unshift(tail.pop() as PlayerID);
    arr = [fixed, ...tail];
  }

  if (!double) return { rounds };

  // Double RR: mirror the pairings (swap a/b) in a second leg
  const secondLeg: RoundDefinition[] = rounds.map(rd => ({
    round: roundsCount + rd.round,
    byes: [...rd.byes],
    pairings: rd.pairings.map(p => ({ a: p.b, b: p.a })),
  }));

  return { rounds: [...rounds, ...secondLeg] };
}

/**
 * Convenience: get a single round (1-based index).
 * Throws if roundNumber is out of range.
 */
export function getRoundRobinRound(
  players: ReadonlyArray<PlayerID>,
  roundNumber: number,
  options?: RoundRobinOptions
): RoundDefinition {
  const schedule = buildRoundRobinSchedule(players, options);
  const rd = schedule.rounds[roundNumber - 1];
  if (!rd) {
    const total = schedule.rounds.length;
    throw new Error(`getRoundRobinRound: round ${roundNumber} out of range (1..${total})`);
  }
  return rd;
}
