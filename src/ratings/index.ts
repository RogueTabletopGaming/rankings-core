// src/ratings/index.ts
import { updateEloRatings, expectedScore } from './elo';

export type {
  RatingMode,
  RatingRequest,
  RatingResult,
  EloMatch,
  EloOptions,
  EloUpdateResult,
  EloResult,
} from './types';

export { updateEloRatings, expectedScore };

// Generic facade – lets callers choose a mode now or later
export function updateRatings(req: import('./types').RatingRequest) {
  if (req.mode === 'elo') {
    const { base = {}, matches, options } = req;
    return updateEloRatings(base, matches, options);
  }
  // else if (req.mode === 'glicko2') { ... }
  throw new Error(`Unsupported rating mode: ${(req as any).mode}`);
}
