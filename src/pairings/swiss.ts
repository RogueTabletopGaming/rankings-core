/**
 * Swiss Pairings for rankings-core
 * --------------------------------
 * Generates pairings from current standings while avoiding rematches and
 * keeping players inside score groups (downfloating only when needed).
 *
 * Deterministic: choices are based on a stable seed (eventId).
 */

import type { Match, PlayerID, StandingRow } from "../standings/types";

// ---------- Types ----------

export interface Pairing {
  a: PlayerID;
  b: PlayerID;
}

export interface SwissPairingOptions {
  eventId?: string;           // seed for deterministic choices (default: 'rankings-core')
  avoidRematches?: boolean;   // default: true
  protectTopN?: number;       // keep top-N in group if possible (default: 0)
  preferGroupIntegrity?: boolean; // reserved for future use (currently groups are strict)
  byePoints?: number;         // informational; default 3
  maxBacktrack?: number;      // cap DFS steps; default 2000
}

export interface SwissPairingResult {
  pairings: Pairing[];
  bye?: PlayerID;
  downfloats: Record<PlayerID, number>;
  rematchesUsed: Array<{ a: PlayerID; b: PlayerID }>;
}

// ---------- Small utils ----------

function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

// safe array accessor (strict TS friendliness)
function at<T>(arr: T[], idx: number): T | undefined {
  return arr[idx];
}

// ---------- Core ----------

export function generateSwissPairings(
  standings: ReadonlyArray<StandingRow>,
  history: ReadonlyArray<Match>,
  options?: SwissPairingOptions
): SwissPairingResult {
  const {
    eventId = "rankings-core",
    avoidRematches = true,
    protectTopN = 0,
    preferGroupIntegrity = true, // reserved (groups are already strict)
    byePoints = 3,               // informational only for now
    maxBacktrack = 2000,
  } = options || {};

  // --- derived state
  const players: PlayerID[] = standings.map((s) => s.playerId);
  const unpaired = new Set<PlayerID>(players);
  const playedWith: Record<PlayerID, Set<PlayerID>> = Object.create(null);
  const byesTaken = new Set<PlayerID>();
  const downfloatCounts: Record<PlayerID, number> = Object.create(null);

  // Ensures we always have a Set for a given player (no undefined under strict index access)
  const pw = (id: PlayerID): Set<PlayerID> => {
    let s = playedWith[id];
    if (!s) {
      s = new Set<PlayerID>();
      playedWith[id] = s;
    }
    return s;
  };

  for (const pid of players) {
    downfloatCounts[pid] = 0;
    // lazily init playedWith via pw(...)
  }

  // Build history constraints
  for (const m of history) {
    const a = m.playerId;
    const b = m.opponentId;
    if (b === null) {
      byesTaken.add(a);
    } else {
      pw(a).add(b);
      pw(b).add(a);
    }
  }

  // --- group by match points (score groups), preserve standings order
  const groups = new Map<number, PlayerID[]>();
  for (const s of standings) {
    const list = groups.get(s.matchPoints) ?? [];
    list.push(s.playerId);
    groups.set(s.matchPoints, list);
  }
  const mpKeysDesc = Array.from(groups.keys()).sort((a, b) => b - a);

  // --- assign BYE if odd count
  let bye: PlayerID | undefined;
  if (players.length % 2 === 1) {
    // lowest-ranked without prior bye; else absolute lowest
    const inOrderLowToHigh = [...players].reverse();
    const candidate = inOrderLowToHigh.find((p) => !byesTaken.has(p));
    const fallback = at(inOrderLowToHigh, 0);
    bye = candidate ?? fallback;
    if (bye !== undefined) unpaired.delete(bye);
  }

  const seedKey = (id: PlayerID) => fnv1a(`${eventId}::pairing::${id}`);

  const pairings: Pairing[] = [];
  const rematchesUsed: Array<{ a: PlayerID; b: PlayerID }> = [];

  // working groups (mutable lists of unpaired ids)
  const work: Array<{ mp: number; ids: PlayerID[] }> = mpKeysDesc.map((mp) => ({
    mp,
    ids: (groups.get(mp) ?? []).filter((id) => unpaired.has(id)),
  }));

  const standingsIndex: Record<PlayerID, number> = Object.create(null);
  standings.forEach((s, idx) => {
    standingsIndex[s.playerId] = idx;
  });

  const downfloat = (groupIdx: number, pid: PlayerID) => {
    const next = at(work, groupIdx + 1);
    if (next) {
      next.ids.push(pid);
    } else {
      work.push({ mp: Number.NEGATIVE_INFINITY, ids: [pid] });
    }
    const cur = downfloatCounts[pid] ?? 0;
    downfloatCounts[pid] = cur + 1;
  };

  // Pair a bag of ids with DFS backtracking
  const pairBag = (ids: PlayerID[]) => {
    // internal run with/without rematches
    const run = (allowRematches: boolean) => {
      const chosen: Pairing[] = [];
      const used = new Set<PlayerID>();
      let steps = 0;

      const dfs = (startIdx: number): boolean => {
        if (++steps > maxBacktrack) return false;
        if (startIdx >= ids.length) return true;
        const a = ids[startIdx];
        if (a === undefined) return true;
        if (used.has(a)) return dfs(startIdx + 1);

        // build candidate partner lists
        const clean: PlayerID[] = [];
        const dirty: PlayerID[] = [];
        for (let j = startIdx + 1; j < ids.length; j++) {
          const b = ids[j];
          if (b === undefined || used.has(b)) continue;
          const isRematch = pw(a).has(b);
          if (isRematch) dirty.push(b);
          else clean.push(b);
        }

        // if we are NOT allowing rematches in this pass:
        if (!allowRematches) {
          if (clean.length === 0) return false; // force backtrack up the tree
        }

        const candidates = clean.length > 0 ? clean : (allowRematches ? dirty : []);

        // rank candidates: adjacency → fewer downfloats → seed
        candidates.sort((x, y) => {
          const dx = Math.abs(ids.indexOf(x) - startIdx);
          const dy = Math.abs(ids.indexOf(y) - startIdx);
          if (dx !== dy) return dx - dy;
          const dfx = downfloatCounts[x] ?? 0;
          const dfy = downfloatCounts[y] ?? 0;
          if (dfx !== dfy) return dfx - dfy;
          return seedKey(x) - seedKey(y);
        });

        for (const b of candidates) {
          used.add(a);
          used.add(b);
          chosen.push({ a, b });
          const ok = dfs(startIdx + 1);
          if (ok) return true;
          // backtrack
          chosen.pop();
          used.delete(a);
          used.delete(b);
        }

        return false;
      };

      const ok = dfs(0);
      const leftovers = ids.filter((id) => !used.has(id));
      return { ok, chosen, leftovers };
    };

    // Pass 1: strictly no rematches
    const strict = run(false);
    if (strict.ok && strict.leftovers.length === 0) return strict;

    // Pass 2: allow rematches as last resort
    return run(true);
  };

  // process groups top-down
  for (let gi = 0; gi < work.length; gi++) {
    const group = at(work, gi);
    if (!group) continue; // safety for strict index access

    let ids = group.ids.filter((id) => unpaired.has(id));
    if (ids.length === 0) continue;

    let result = pairBag(ids);

    // try downfloat if needed
    while (result.leftovers.length > 0) {
      // pick lowest-ranked leftover that isn't protected by protectTopN
      const viable = result.leftovers.filter((id) => {
        const idx = standingsIndex[id] ?? Number.MAX_SAFE_INTEGER;
        return protectTopN > 0 ? idx >= protectTopN : true;
      });
      const pick =
        at(viable, viable.length - 1) ??
        at(result.leftovers, result.leftovers.length - 1);
      if (!pick) break;

      // remove and downfloat
      ids = ids.filter((id) => id !== pick);
      downfloat(gi, pick);

      result = pairBag(ids);
      if (result.ok && result.leftovers.length === 0) break;
      if (viable.length === 0) break;
    }

    // commit selected pairings
    for (const p of result.chosen) {
      pairings.push(p);
      unpaired.delete(p.a);
      unpaired.delete(p.b);
      if (pw(p.a).has(p.b)) rematchesUsed.push({ a: p.a, b: p.b });
      pw(p.a).add(p.b);
      pw(p.b).add(p.a);
    }
  }

  // final cleanup: pair any remaining unpaired greedily (should be rare)
  if (unpaired.size > 0) {
    const ids = [...unpaired];
    ids.sort((a, b) => seedKey(a) - seedKey(b));
    while (ids.length >= 2) {
      const a = ids.shift() as PlayerID;
      let bIdx = ids.findIndex((b) => !(avoidRematches && pw(a).has(b)));
      if (bIdx < 0) bIdx = 0;
      const b = ids.splice(bIdx, 1)[0] as PlayerID;
      pairings.push({ a, b });
      if (pw(a).has(b)) rematchesUsed.push({ a, b });
      pw(a).add(b);
      pw(b).add(a);
      unpaired.delete(a);
      unpaired.delete(b);
    }
  }

  // Ensure deterministic ordering of pairings (by standings rank then seed)
  const pos: Record<PlayerID, number> = Object.create(null);
  standings.forEach((s, i) => {
    pos[s.playerId] = i;
  });
  pairings.sort((p1, p2) => {
    const a1 = pos[p1.a] ?? 0, a2 = pos[p2.a] ?? 0;
    if (a1 !== a2) return a1 - a2;
    const b1 = pos[p1.b] ?? 0, b2 = pos[p2.b] ?? 0;
    if (b1 !== b2) return b1 - b2;
    return seedKey(p1.a + "::" + p1.b) - seedKey(p2.a + "::" + p2.b);
  });

  return { pairings, bye, downfloats: downfloatCounts, rematchesUsed };
}
