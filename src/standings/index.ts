// src/standings/index.ts
// Facade for standings engines with dynamic dispatch by `mode`.

export type {
  PlayerID,
  Match,
  StandingRow,
  ComputeSwissOptions,
  ComputeRoundRobinOptions,
} from './types';
export { MatchResult } from './types';

import type {
  Match,
  StandingRow,
  ComputeSwissOptions,
  ComputeRoundRobinOptions,
} from './types';

import { computeSwissStandings } from './swiss';
import { computeRoundRobinStandings } from './roundrobin';

export type StandingsMode = 'swiss' | 'roundrobin';

export type ComputeStandingsOptions =
  | ({ mode: 'swiss' } & ComputeSwissOptions)
  | ({ mode: 'roundrobin' } & ComputeRoundRobinOptions);

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
    };

/**
 * Unified standings entrypoint.
 */
export function computeStandings(req: ComputeStandingsRequest): StandingRow[] {
  if (req.mode === 'swiss') {
    return computeSwissStandings(req.matches, req.options);
  } else {
    return computeRoundRobinStandings(req.matches, req.options);
  }
}

// Named exports for direct engine usage
export {
  computeSwissStandings,
} from './swiss';

export {
  computeRoundRobinStandings,
} from './roundrobin';
