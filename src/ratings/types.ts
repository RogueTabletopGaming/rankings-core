// src/ratings/types.ts
import type { PlayerID } from '../standings/types';

export type RatingMode = 'elo' | 'glicko2'; // glicko2 later

// Generic “batch update” request (mode-dispatched)
export type RatingRequest =
  | { mode: 'elo';    matches: EloMatch[];   base?: Record<PlayerID, number>; options?: EloOptions }
  // | { mode: 'glicko2'; ... } // later
  ;

export interface RatingResult {
  ratings: Record<PlayerID, number>;
  deltas?: Record<PlayerID, number>; // optional convenience
}

// ---------- ELO-specific types (re-exported by ratings/index.ts) ----------
export type EloResult = 'A' | 'B' | 'draw';

export interface EloMatch {
  a: PlayerID;
  b: PlayerID;
  result: EloResult;
  weight?: number; // default 1
}

export interface EloOptions {
  K?: number;                  // default 32
  KDraw?: number;              // default K
  perPlayerK?: Record<PlayerID, number>;
  initialRating?: number;      // default 1500
  floor?: number;              // optional
  cap?: number;                // optional
  mode?: 'sequential' | 'simultaneous'; // default sequential
    drawScore?: number; // <-- add this
}

export interface EloUpdateResult extends RatingResult {
  mode: 'elo';
}

export function isDraw(r: EloResult): r is 'draw' { return r === 'draw'; }
export const DEFAULT_RATING = 1500;
