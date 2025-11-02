// src/standings/singleelimination.ts
import {
  type Match,
  type PlayerID,
  type SingleEliminationStandingRow,
  type ComputeSingleEliminationOptions,
  MatchResult,
} from './types';
import { fnv1a } from '../utils/hash'; // or inline it if you didn't extract

export function computeSingleEliminationStandings(
  matches: Match[],
  options?: ComputeSingleEliminationOptions
): SingleEliminationStandingRow[] {
  const {
    eventId = 'rankings-core',
    seeding = {},
    useBronzeMatch = true, // currently unused, but kept for API
  } = options || {};

  const byPlayer: Record<PlayerID, Match[]> = Object.create(null);
  for (const m of matches) {
    (byPlayer[m.playerId] ||= []).push(m);
  }
  for (const pid of Object.keys(byPlayer)) {
    byPlayer[pid].sort(
      (a, b) => a.round - b.round || a.id.localeCompare(b.id)
    );
  }

  // find the deepest round in the bracket
  let maxRound = 0;
  for (const m of matches) {
    if (m.round > maxRound) maxRound = m.round;
  }

  const rows: SingleEliminationStandingRow[] = [];

  for (const pid of Object.keys(byPlayer)) {
    const ms = byPlayer[pid];
    const last = ms[ms.length - 1];

    const wins = ms.filter(
      (m) => m.result === MatchResult.WIN || m.result === MatchResult.FORFEIT_WIN
    ).length;
    const losses = ms.filter(
      (m) => m.result === MatchResult.LOSS || m.result === MatchResult.FORFEIT_LOSS
    ).length;
    const gameWins = ms.reduce((a, m) => a + (m.gameWins || 0), 0);
    const gameLosses = ms.reduce((a, m) => a + (m.gameLosses || 0), 0);
    const gameDraws = ms.reduce((a, m) => a + (m.gameDraws || 0), 0);
    const penalties = ms.reduce((a, m) => a + (m.penalties || 0), 0);

    // champion: won in the final round
    let elimRound: number;
    if (
      last &&
      last.round === maxRound &&
      (last.result === MatchResult.WIN || last.result === MatchResult.FORFEIT_WIN)
    ) {
      elimRound = maxRound + 1;
    } else {
      elimRound = last ? last.round : 0;
    }

    rows.push({
      rank: 0, // will fill after sort
      playerId: pid,
      matchPoints: wins,     // not super meaningful in SE but keeps shape
      mwp: 0,
      omwp: 0,
      gwp: 0,
      ogwp: 0,
      sb: 0,
      wins,
      losses,
      draws: 0,
      byes: 0,
      roundsPlayed: ms.length,
      gameWins,
      gameLosses,
      gameDraws,
      penalties,
      opponents: ms
        .map((m) => m.opponentId)
        .filter((x): x is PlayerID => x !== null),
      elimRound,
    });
  }

  // sort
  rows.sort((a, b) => {
    // 1) deeper in bracket wins
    if (b.elimRound !== a.elimRound) return b.elimRound - a.elimRound;

    // 2) seeding if provided
    const sa = seeding[a.playerId];
    const sb = seeding[b.playerId];
    if (sa !== undefined && sb !== undefined && sa !== sb) {
      return sa - sb; // lower seed = better
    }

    // 3) fewer penalties
    if (a.penalties !== b.penalties) return a.penalties - b.penalties;

    // 4) stable fallback
    const ha = fnv1a(`${eventId}::single-elim::${a.playerId}`);
    const hb = fnv1a(`${eventId}::single-elim::${b.playerId}`);
    return ha - hb;
  });

  // assign rank
  rows.forEach((r, i) => {
    r.rank = i + 1;
  });

  return rows;
}
