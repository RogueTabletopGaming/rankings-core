// src/standings/swiss.ts
// Swiss + Buchholz standings engine (modular version)

import type {
  PlayerID,
  Match,
  StandingRow,
  ComputeSwissOptions,
} from './types';
import { MatchResult } from './types';

import { fnv1a } from '../utils/hash';

// ---------- utils ----------
const PCT_FLOOR_DEFAULT = 0.33;

function div(n: number, d: number): number {
  return d > 0 ? n / d : 0;
}
function sum(ns: number[]): number {
  return ns.reduce((a, b) => a + b, 0);
}
function isRealOpponent(id: PlayerID | null): id is PlayerID {
  return id !== null;
}
function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

// Safe array element accessor for noUncheckedIndexedAccess environments
function at<T>(arr: T[], idx: number): T | undefined {
  return arr[idx];
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

function ptsFromResult(
  r: Match['result'],
  map: Required<Required<ComputeSwissOptions>['points']>
): number {
  switch (r) {
    case MatchResult.WIN:
    case MatchResult.FORFEIT_WIN:
      return map.win!;
    case MatchResult.DRAW:
      return map.draw!;
    case MatchResult.LOSS:
    case MatchResult.FORFEIT_LOSS:
      return map.loss!;
    case MatchResult.BYE:
      return map.bye!;
    default: {
      // Exhaustiveness guard
      const _exhaustive: never = r as never;
      return map.loss!;
    }
  }
}

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

function tally(
  ms: Match[],
  map: Required<Required<ComputeSwissOptions>['points']>
): Totals {
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

function avgWithFloor(values: number[], floor: number): number {
  if (!values.length) return 0;
  return sum(values.map(v => Math.max(floor, v))) / values.length;
}

function headToHeadOrder(
  tied: PlayerID[],
  byPlayer: Record<PlayerID, Match[]>
): PlayerID[] | null {
  // null-prototype to avoid inherited props
  const scores: Record<PlayerID, number> = Object.create(null);
  for (const id of tied) scores[id] = 0;

  const add = (id: PlayerID, delta: number) => {
    scores[id] = (scores[id] ?? 0) + delta;
  };

  for (const a of tied) {
    const ms = byPlayer[a] ?? [];
    for (const m of ms) {
      if (!isRealOpponent(m.opponentId)) continue;
      const b = m.opponentId;
      if (!(b in scores)) continue; // only count games vs tied group

      if (m.result === MatchResult.WIN || m.result === MatchResult.FORFEIT_WIN) add(a, 1);
      else if (m.result === MatchResult.DRAW) add(a, 0.5);
    }
  }

  const get = (id: PlayerID) => scores[id] ?? 0;

  const ordered = [...tied].sort((x, y) => get(y) - get(x));

  // strictness check—no equal adjacent scores
  let prevId: PlayerID | null = null;
  for (const id of ordered) {
    if (prevId !== null) {
      if (Math.abs(get(id) - get(prevId)) < 1e-9) return null;
    }
    prevId = id;
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
  if (!first) return true;
  const p = first.penalties;
  for (const r of block) {
    if (r.penalties !== p) return false;
  }
  return true;
}

// ---------- single-entry normalization (optional) ----------
function flipResult(r: MatchResult): MatchResult {
  switch (r) {
    case MatchResult.WIN:          return MatchResult.LOSS;
    case MatchResult.LOSS:         return MatchResult.WIN;
    case MatchResult.DRAW:         return MatchResult.DRAW;
    case MatchResult.BYE:          return MatchResult.BYE; // no mirror created for BYEs anyway
    case MatchResult.FORFEIT_WIN:  return MatchResult.FORFEIT_LOSS;
    case MatchResult.FORFEIT_LOSS: return MatchResult.FORFEIT_WIN;
    default:                       return r;
  }
}

/**
 * If `acceptSingleEntryMatches` is true, ensure that for every (A vs B, round r)
 * there is also a mirrored (B vs A, round r). We DO NOT mirror BYEs (opponentId=null).
 * We also avoid duplicating if both sides were already provided.
 */
function normalizeMatchesForMirroring(matches: ReadonlyArray<Match>): Match[] {
  const out: Match[] = [...matches];
  const seen = new Set<string>();
  const key = (round: number, a: PlayerID, b: PlayerID) => `${round}|${a}|${b}`;

  for (const m of matches) {
    if (m.opponentId !== null) {
      seen.add(key(m.round, m.playerId, m.opponentId));
    }
  }

  for (const m of matches) {
    const opp = m.opponentId;
    if (opp === null) continue; // no mirror for BYE
    const kBA = key(m.round, opp, m.playerId);
    if (!seen.has(kBA)) {
      const mirror: Match = {
        id: `${m.id}#mirror`,
        round: m.round,
        playerId: opp,
        opponentId: m.playerId,
        result: flipResult(m.result),
        gameWins: m.gameLosses,
        gameLosses: m.gameWins,
        gameDraws: m.gameDraws,
        penalties: 0,
      };
      out.push(mirror);
      seen.add(kBA);
    }
  }
  return out;
}

// ---------- main ----------
export function computeSwissStandings(
  matches: Match[],
  options?: ComputeSwissOptions
): StandingRow[] {
  const {
    eventId = 'rankings-core',
    applyHeadToHead = true,
    tiebreakFloors = { opponentPctFloor: PCT_FLOOR_DEFAULT },
    points = { win: 3, draw: 1, loss: 0, bye: 3 },
    acceptSingleEntryMatches = false,
    // NEW: allow virtual-bye config (default off)
    tiebreakVirtualBye: vbOpt,
  } = options || {};

  // normalize virtual-bye options with defaults
  const vb = {
    enabled: vbOpt?.enabled ?? false,
    mwp: vbOpt?.mwp ?? 0.5,
    gwp: vbOpt?.gwp ?? 0.5,
  };

  const input = acceptSingleEntryMatches
    ? normalizeMatchesForMirroring(matches)
    : matches;

  const pctFloor = tiebreakFloors.opponentPctFloor ?? PCT_FLOOR_DEFAULT;
  const pt = {
    win:  points.win  ?? 3,
    draw: points.draw ?? 1,
    loss: points.loss ?? 0,
    bye:  points.bye  ?? 3,
  };

  const byPlayer = groupByPlayer(input);
  const playerIds = Object.keys(byPlayer);

  // Base rows include all StandingRow fields except rank
  type BaseRow = Omit<StandingRow, 'rank'>;
  const base: Record<PlayerID, BaseRow> = Object.create(null);

  // 1) Tallies
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
      gameWins: t.gWins + 2 * t.byes, // reflect bye 2–0 for visibility
      gameLosses: t.gLosses,
      gameDraws: t.gDraws,
      penalties: t.penalties,
      opponents: [...t.opponents],
      omwp: 0,
      ogwp: 0,
      sb: 0,
    };
  }

  // 2) OMW/OGWP
  for (const pid of playerIds) {
    const b = base[pid];
    if (!b) continue;
    const omw: number[] = [];
    const ogw: number[] = [];

    // real opponents
    for (const oid of b.opponents) {
      const oppMs = byPlayer[oid] ?? [];
      omw.push(computeOpponentPctExclSubject(pid, oppMs, false));
      ogw.push(computeOpponentPctExclSubject(pid, oppMs, true));
    }

    // NEW: optional virtual-bye treatment (adds synthetic opponents)
    if (vb.enabled && b.byes > 0) {
      const vMW = clamp01(vb.mwp);
      const vGW = clamp01(vb.gwp);
      for (let k = 0; k < b.byes; k++) {
        omw.push(vMW);
        ogw.push(vGW);
      }
    }

    b.omwp = avgWithFloor(omw, pctFloor);
    b.ogwp = avgWithFloor(ogw, pctFloor);
  }

  // 3) Sonneborn–Berger (needs final MP)
  const finalMP: Record<PlayerID, number> = Object.create(null);
  for (const pid of playerIds) {
    const b = base[pid];
    if (!b) continue;
    finalMP[pid] = b.matchPoints;
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

  // 4) Assemble rows
  const rows: StandingRow[] = [];
  for (const pid of playerIds) {
    const b = base[pid];
    if (!b) continue;
    rows.push({ rank: 0, ...b });
  }

  // 5) Primary sort
  rows.sort((a, b) => {
    if (b.matchPoints !== a.matchPoints) return b.matchPoints - a.matchPoints;
    if (Math.abs(b.omwp - a.omwp) > 1e-12) return b.omwp - a.omwp;
    if (Math.abs(b.gwp - a.gwp) > 1e-12) return b.gwp - a.gwp;
    if (Math.abs(b.ogwp - a.ogwp) > 1e-12) return b.ogwp - a.ogwp;
    if (Math.abs(b.sb - a.sb) > 1e-12) return b.sb - a.sb;
    return 0;
  });

  // 6) Tie blocks (H2H → penalties → seeded fallback)
  let i = 0;
  while (i < rows.length) {
    const first = at(rows, i);
    if (!first) break;

    // find end of tie block [i, j)
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
            for (const id of ids) key[id] = fnv1a(`${eventId}::fallback::${id}`);
            block.sort((a, b) => (key[a.playerId] ?? 0) - (key[b.playerId] ?? 0));
          }
        }
      } else {
        block.sort((a, b) => a.penalties - b.penalties);
        if (allPenaltiesEqual(block)) {
          const key: Record<PlayerID, number> = Object.create(null);
          for (const id of ids) key[id] = fnv1a(`${eventId}::fallback::${id}`);
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
