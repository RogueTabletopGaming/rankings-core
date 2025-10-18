// src/standings/roundrobin.ts
// Round-robin standings with Swiss-style tie-breakers,
// plus strict single-entry detection and optional reconstruction.

import type {
  PlayerID,
  Match,
  StandingRow,
  ComputeRoundRobinOptions,
} from './types';
import { MatchResult } from './types';

// ---------- small utils ----------
const PCT_FLOOR_DEFAULT = 0.33;

const at = <T,>(arr: T[], idx: number): T | undefined => arr[idx];

const div = (n: number, d: number) => (d > 0 ? n / d : 0);
const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0);

const isRealOpponent = (id: PlayerID | null): id is PlayerID => id !== null;

function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

// safe map get/set for number accumulators
function inc(map: Record<string, number>, key: string, delta: number) {
  map[key] = (map[key] ?? 0) + delta;
}

// ---------- pairing key for strict single-entry detection ----------
type PairKey = string;
const pairKey = (a: string, b: string, round: number): PairKey => {
  const x = a < b ? a : b;
  const y = a < b ? b : a;
  return `${round}::${x}::${y}`;
};

// ---------- points mapping ----------
function ptsFromResult(
  r: Match['result'],
  map: Required<Required<ComputeRoundRobinOptions>['points']>
): number {
  switch (r) {
    case MatchResult.WIN:
    case MatchResult.FORFEIT_WIN:   return map.win!;
    case MatchResult.DRAW:          return map.draw!;
    case MatchResult.LOSS:
    case MatchResult.FORFEIT_LOSS:  return map.loss!;
    case MatchResult.BYE:           return map.bye!;
    default: {
      // Exhaustiveness guard (future-proof)
      const _exhaustive: never = r as never;
      return map.loss!;
    }
  }
}

// ---------- grouping ----------
type ByPlayer<T> = Record<PlayerID, T>;
function groupByPlayer(matches: Match[]): ByPlayer<Match[]> {
  const by: ByPlayer<Match[]> = Object.create(null);
  for (const m of matches) {
    (by[m.playerId] ||= []).push(m);
  }
  for (const pid of Object.keys(by)) {
    const list = by[pid];
    if (list) list.sort((a, b) => a.round - b.round || a.id.localeCompare(b.id));
  }
  return by;
}

// ---------- aggregates ----------
interface Totals {
  wins: number;
  losses: number;
  draws: number;
  byes: number;
  mp: number;
  gWins: number;
  gLosses: number;
  gDraws: number;
  penalties: number;
  opponents: PlayerID[];
  roundsPlayed: number;
}

function tally(ms: Match[], map: Required<Required<ComputeRoundRobinOptions>['points']>): Totals {
  let wins = 0, losses = 0, draws = 0, byes = 0;
  let mp = 0, gWins = 0, gLosses = 0, gDraws = 0, penalties = 0;
  const opponents: PlayerID[] = [];
  let roundsPlayed = 0;

  for (const m of ms) {
    mp += ptsFromResult(m.result, map);
    roundsPlayed++;

    if (m.result === MatchResult.WIN || m.result === MatchResult.FORFEIT_WIN) wins++;
    else if (m.result === MatchResult.LOSS || m.result === MatchResult.FORFEIT_LOSS) losses++;
    else if (m.result === MatchResult.DRAW) draws++;
    else if (m.result === MatchResult.BYE) byes++;

    gWins   += m.gameWins   || 0;
    gLosses += m.gameLosses || 0;
    gDraws  += m.gameDraws  || 0;

    if (isRealOpponent(m.opponentId)) opponents.push(m.opponentId);
    penalties += m.penalties || 0;
  }

  return { wins, losses, draws, byes, mp, gWins, gLosses, gDraws, penalties, opponents, roundsPlayed };
}

function computeMWP(t: Totals): number {
  return div(t.wins + 0.5 * t.draws, t.wins + t.losses + t.draws);
}

function computeGWP(t: Totals, floor: number): number {
  // Treat each BYE as 2–0 for percentage math (visibility); does not fabricate real games.
  const byeGWins = 2 * t.byes;
  const num = t.gWins + byeGWins + 0.5 * t.gDraws;
  const den = t.gWins + t.gLosses + t.gDraws + byeGWins;
  return Math.max(floor, div(num, den));
}

function computeOpponentPctExclSubject(
  subjectId: PlayerID,
  oppMatches: Match[],
  isGamePct: boolean
): number {
  const ms = oppMatches.filter(
    (m) => m.opponentId !== null && m.opponentId !== subjectId && m.result !== MatchResult.BYE
  );
  if (!isGamePct) {
    let w = 0, l = 0, d = 0;
    for (const m of ms) {
      if (m.result === MatchResult.WIN || m.result === MatchResult.FORFEIT_WIN) w++;
      else if (m.result === MatchResult.LOSS || m.result === MatchResult.FORFEIT_LOSS) l++;
      else if (m.result === MatchResult.DRAW) d++;
    }
    return div(w + 0.5 * d, w + l + d);
  } else {
    let gw = 0, gl = 0, gd = 0;
    for (const m of ms) {
      gw += m.gameWins   || 0;
      gl += m.gameLosses || 0;
      gd += m.gameDraws  || 0;
    }
    return div(gw + 0.5 * gd, gw + gl + gd);
  }
}

const avgWithFloor = (values: number[], floor: number) =>
  values.length ? sum(values.map(v => Math.max(floor, v))) / values.length : 0;

function headToHeadOrder(
  tied: PlayerID[],
  byPlayer: Record<PlayerID, Match[]>
): PlayerID[] | null {
  const scores: Record<PlayerID, number> = Object.create(null);
  for (const id of tied) scores[id] = 0;

  const add = (id: PlayerID, delta: number) => { scores[id] = (scores[id] ?? 0) + delta; };

  for (const a of tied) {
    const ms = byPlayer[a] ?? [];
    for (const m of ms) {
      if (!isRealOpponent(m.opponentId)) continue;
      const b = m.opponentId;
      if (!(b in scores)) continue; // only count games within the tie set
      if (m.result === MatchResult.WIN || m.result === MatchResult.FORFEIT_WIN) add(a, 1);
      else if (m.result === MatchResult.DRAW) add(a, 0.5);
    }
  }

  const get = (id: PlayerID) => scores[id] ?? 0;
  const ordered = [...tied].sort((x, y) => get(y) - get(x));

  // If any adjacent have equal scores, we decline H2H ordering.
  let prev: PlayerID | null = null;
  for (const id of ordered) {
    if (prev !== null && Math.abs(get(id) - get(prev)) < 1e-9) return null;
    prev = id;
  }
  return ordered;
}

function sameTieKey(a: StandingRow, b: StandingRow): boolean {
  return (
    a.matchPoints === b.matchPoints &&
    Math.abs(a.omwp - b.omwp) < 1e-12 &&
    Math.abs(a.gwp - b.gwp) < 1e-12 &&
    Math.abs(a.ogwp - b.ogwp) < 1e-12 &&
    Math.abs(a.sb - b.sb) < 1e-12
  );
}

function allPenaltiesEqual(block: StandingRow[]): boolean {
  const first = block.length > 0 ? block[0] : undefined;
  if (!first) return true; // empty/singleton treated as equal
  const p = first.penalties;
  for (const r of block) if (r.penalties !== p) return false;
  return true;
}

// ---------- main ----------
export function computeRoundRobinStandings(
  matches: Match[],
  options?: ComputeRoundRobinOptions
): StandingRow[] {
  const {
    eventId = 'rankings-core',
    applyHeadToHead = true,
    tiebreakFloors = { opponentPctFloor: PCT_FLOOR_DEFAULT },
    points = { win: 3, draw: 1, loss: 0, bye: 3 },
    acceptSingleEntryMatches = false,
  } = options || {};

  const pctFloor = tiebreakFloors.opponentPctFloor ?? PCT_FLOOR_DEFAULT;
  const pt = {
    win:  points.win  ?? 3,
    draw: points.draw ?? 1,
    loss: points.loss ?? 0,
    bye:  points.bye  ?? 3,
  };

  // --- Strict single-entry detection (before any normalization) ---
  const seen: Record<PairKey, { count: number; sample: Match }> = Object.create(null);
  for (const m of matches) {
    if (m.opponentId === null) continue; // BYE is inherently single-entry
    const key = pairKey(m.playerId, m.opponentId, m.round);
    if (!seen[key]) seen[key] = { count: 0, sample: m };
    seen[key].count += 1;
  }

  if (!acceptSingleEntryMatches) {
    for (const k of Object.keys(seen)) {
      const { count, sample } = seen[k]!;
      if (count === 1 && sample.opponentId !== null) {
        throw new Error(
          `roundrobin: missing mirrored entry for ${sample.playerId} vs ${sample.opponentId} in round ${sample.round}. ` +
          `Set { acceptSingleEntryMatches: true } to auto-reconstruct.`
        );
      }
    }
  }

  // --- Optional reconstruction of missing mirrors ---
  let normalized: Match[] = [...matches];
  if (acceptSingleEntryMatches) {
    for (const k of Object.keys(seen)) {
      const { count, sample } = seen[k]!;
      if (count === 1 && sample.opponentId !== null) {
        // build mirrored match
        const invResult =
          sample.result === MatchResult.WIN          ? MatchResult.LOSS :
          sample.result === MatchResult.LOSS         ? MatchResult.WIN :
          sample.result === MatchResult.FORFEIT_WIN  ? MatchResult.FORFEIT_LOSS :
          sample.result === MatchResult.FORFEIT_LOSS ? MatchResult.FORFEIT_WIN :
          /* DRAW or BYE (BYE cannot be here) */ MatchResult.DRAW;

        normalized.push({
          id: `${sample.id}#mirror`,
          round: sample.round,
          playerId: sample.opponentId,
          opponentId: sample.playerId,
          result: invResult,
          gameWins: sample.gameLosses,
          gameLosses: sample.gameWins,
          gameDraws: sample.gameDraws,
          penalties: sample.penalties ?? 0,
        });
      }
    }
  }

  // ---------- compute ----------
  const byPlayer = groupByPlayer(normalized);
  const playerIds = Object.keys(byPlayer);

  // Build base rows (without rank)
  type BaseRow = Omit<StandingRow, 'rank'>;
  const base: Record<PlayerID, BaseRow> = Object.create(null);

  // Tallies
  for (const pid of playerIds) {
    const ms = byPlayer[pid] ?? [];
    const t = tally(ms, pt);
    base[pid] = {
      playerId: pid,
      matchPoints: t.mp,
      mwp: computeMWP(t),
      gwp: computeGWP(t, pctFloor),
      wins: t.wins,
      losses: t.losses,
      draws: t.draws,
      byes: t.byes,
      roundsPlayed: t.roundsPlayed,
      gameWins: t.gWins + 2 * t.byes, // 2–0 visualization for byes
      gameLosses: t.gLosses,
      gameDraws: t.gDraws,
      penalties: t.penalties,
      opponents: [...t.opponents],
      omwp: 0,
      ogwp: 0,
      sb: 0,
    };
  }

  // OMW/OGWP
  for (const pid of playerIds) {
    const b = base[pid];
    if (!b) continue;
    const omw: number[] = [];
    const ogw: number[] = [];
    for (const oid of b.opponents) {
      const oppMs = byPlayer[oid] ?? [];
      omw.push(computeOpponentPctExclSubject(pid, oppMs, false));
      ogw.push(computeOpponentPctExclSubject(pid, oppMs, true));
    }
    b.omwp = avgWithFloor(omw, pctFloor);
    b.ogwp = avgWithFloor(ogw, pctFloor);
  }

  // Sonneborn–Berger
  const finalMP: Record<PlayerID, number> = Object.create(null);
  for (const pid of playerIds) {
    const b = base[pid];
    if (b) finalMP[pid] = b.matchPoints;
  }
  for (const pid of playerIds) {
    const ms = byPlayer[pid] ?? [];
    let sb = 0;
    for (const m of ms) {
      if (!isRealOpponent(m.opponentId)) continue;
      const oppId: PlayerID = m.opponentId;
      const oppMP = finalMP[oppId] ?? 0;
      if (m.result === MatchResult.WIN || m.result === MatchResult.FORFEIT_WIN) sb += oppMP;
      else if (m.result === MatchResult.DRAW) sb += 0.5 * oppMP;
    }
    const b = base[pid];
    if (b) b.sb = sb;
  }

  // Assemble rows
  const rows: StandingRow[] = [];
  for (const pid of playerIds) {
    const b = base[pid];
    if (b) rows.push({ rank: 0, ...b });
  }

  // Primary sort
  rows.sort((a, b) => {
    if (b.matchPoints !== a.matchPoints) return b.matchPoints - a.matchPoints;
    if (Math.abs(b.omwp - a.omwp) > 1e-12) return b.omwp - a.omwp;
    if (Math.abs(b.gwp - a.gwp) > 1e-12) return b.gwp - a.gwp;
    if (Math.abs(b.ogwp - a.ogwp) > 1e-12) return b.ogwp - a.ogwp;
    if (Math.abs(b.sb - a.sb) > 1e-12) return b.sb - a.sb;
    return 0;
  });

  // Tie blocks: H2H → penalties → seeded fallback
  let i = 0;
  while (i < rows.length) {
    const first = at(rows, i);
    if (!first) break;

    let j = i + 1;
    while (j < rows.length) {
      const nextRow = at(rows, j);
      if (!nextRow || !sameTieKey(first, nextRow)) break;
      j++;
    }

    if (j - i > 1) {
      const block = rows.slice(i, j);
      const ids = block.map(r => r.playerId);

      if (applyHeadToHead) {
        const order = headToHeadOrder(ids, byPlayer);
        if (order && order.length) {
          const pos: Record<PlayerID, number> = Object.create(null);
          let ordIdx = 0;
          for (const id of order) pos[id] = ordIdx++;
          const BIG = Number.MAX_SAFE_INTEGER;
          block.sort((a, b) => (pos[a.playerId] ?? BIG) - (pos[b.playerId] ?? BIG));
        } else {
          // penalties first
          block.sort((a, b) => a.penalties - b.penalties);
          if (allPenaltiesEqual(block)) {
            const key: Record<PlayerID, number> = Object.create(null);
            for (const id of ids) key[id] = fnv1a(`${eventId}::rr-fallback::${id}`);
            block.sort((a, b) => (key[a.playerId] ?? 0) - (key[b.playerId] ?? 0));
          }
        }
      } else {
        block.sort((a, b) => a.penalties - b.penalties);
        if (allPenaltiesEqual(block)) {
          const key: Record<PlayerID, number> = Object.create(null);
          for (const id of ids) key[id] = fnv1a(`${eventId}::rr-fallback::${id}`);
          block.sort((a, b) => (key[a.playerId] ?? 0) - (key[b.playerId] ?? 0));
        }
      }

      rows.splice(i, j - i, ...block);
    }

    i = j;
  }

  rows.forEach((r, idx) => (r.rank = idx + 1));
  return rows;
}
