// src/standings/index.ts
// Facade for standings engines with dynamic dispatch by `mode`.

export type {
  PlayerID,
  Match,
  StandingRow,
  ComputeSwissOptions,
  ComputeRoundRobinOptions,
  ComputeSingleEliminationOptions,
  SingleEliminationStandingRow,
} from './types';
export { MatchResult } from './types';

import type {
  Match,
  StandingRow,
  ComputeSwissOptions,
  ComputeRoundRobinOptions,
  ComputeSingleEliminationOptions,
  SingleEliminationStandingRow,
} from './types';

import { computeSwissStandings } from './swiss';
import { computeRoundRobinStandings } from './roundrobin';
import { computeSingleEliminationStandings } from './singleelimination';

export type StandingsMode = 'swiss' | 'roundrobin' | 'singleelimination';

export type ComputeStandingsOptions =
  | ({ mode: 'swiss' } & ComputeSwissOptions)
  | ({ mode: 'roundrobin' } & ComputeRoundRobinOptions)
  | ({ mode: 'singleelimination' } & ComputeSingleEliminationOptions);

export type ComputeStandingsRequest =
  | {
      mode: 'swiss';
      matches: Match[];
      options?: ComputeSwissOptions;
    }
  | {
      mode: 'roundrobin';
      matches: Match[];
      options?: ComputeRoundRobinOptions;
    }
  | {
      mode: 'singleelimination';
      matches: Match[];
      options?: ComputeSingleEliminationOptions;
    };

/**
 * Unified standings entrypoint.
 * Note: return type is a union because single elimination
 * returns a StandingRow with `elimRound`.
 */
export function computeStandings(
  req: ComputeStandingsRequest
): StandingRow[] | SingleEliminationStandingRow[] {
  if (req.mode === 'swiss') {
    return computeSwissStandings(req.matches, req.options);
  } else if (req.mode === 'roundrobin') {
    return computeRoundRobinStandings(req.matches, req.options);
  } else {
    // singleelimination
    return computeSingleEliminationStandings(req.matches, req.options);
  }
}

// Named exports for direct engine usage
export { computeSwissStandings } from './swiss';
export { computeRoundRobinStandings } from './roundrobin';
export { computeSingleEliminationStandings } from './singleelimination';
