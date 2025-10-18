// src/pairings/index.ts
import type { StandingRow, PlayerID, Match } from '../standings/types';
import {
  generateSwissPairings,
  type SwissPairingOptions,
  type SwissPairingResult,
} from './swiss';
import {
  buildRoundRobinSchedule,
  getRoundRobinRound,
  type RoundRobinOptions,
  type RoundDefinition,
} from './roundrobin';

export type PairingMode = 'swiss' | 'roundrobin';

export type PairingRequest =
  | {
      mode: 'swiss';
      standings: ReadonlyArray<StandingRow>;
      history: ReadonlyArray<Match>;
      options?: SwissPairingOptions;
    }
  | {
      mode: 'roundrobin';
      players: ReadonlyArray<PlayerID>;
      roundNumber: number; // 1-based
      options?: RoundRobinOptions;
    };

/** Normalized result shape for the facade. */
export interface PairingResult {
  pairings: { a: PlayerID; b: PlayerID }[];
  bye?: PlayerID;
  // Swiss-only
  downfloats?: Record<PlayerID, number>;
  rematchesUsed?: { a: PlayerID; b: PlayerID }[];
  // RR-only
  round?: number;
  byes?: PlayerID[];
}

/** Strategy facade for pairing generation. */
export function generatePairings(req: PairingRequest): PairingResult {
  if (req.mode === 'swiss') {
    const r = generateSwissPairings(req.standings, req.history, req.options);
    return {
      pairings: r.pairings,
      bye: r.bye,
      downfloats: r.downfloats,
      rematchesUsed: r.rematchesUsed,
    };
  }
  if (req.mode === 'roundrobin') {
    const rd: RoundDefinition = getRoundRobinRoundOrThrow(
      req.players,
      req.roundNumber,
      req.options,
    );
    return {
      pairings: rd.pairings,
      bye: rd.byes[0],
      round: rd.round,
      byes: rd.byes,
    };
  }
  // Exhaustiveness guard for future modes
  const _exhaustive: never = req;
  return _exhaustive;
}

// helper with better typing
function getRoundRobinRoundOrThrow(
  players: ReadonlyArray<PlayerID>,
  round: number,
  opts?: RoundRobinOptions,
): RoundDefinition {
  return getRoundRobinRound(players, round, opts);
}

// ------------------------------
// Back-compat export (soft-deprecate)
// ------------------------------
/**
 * @deprecated Use `generateSwissPairings` or the generic
 * `generatePairings({ mode: 'swiss', standings, history, options })`.
 */
export function generatePairingsDeprecated(
  standings: ReadonlyArray<StandingRow>,
  history: ReadonlyArray<Match>,
  options?: SwissPairingOptions,
): SwissPairingResult {
  return generateSwissPairings(standings, history, options);
}

// Re-exports (public API surface)
export {
  generateSwissPairings,
  type SwissPairingOptions,
  type SwissPairingResult,
} from './swiss';

export {
  buildRoundRobinSchedule,
  getRoundRobinRound,
  type RoundRobinOptions,
  type RoundDefinition,
} from './roundrobin';

// NOTE: Do NOT re-export PairingMode/PairingRequest/PairingResult again here;
// they are already exported above and double-exporting causes conflicts.
