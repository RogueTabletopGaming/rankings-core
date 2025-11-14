// src/index.ts
// Public package entrypoint: types + re-exports for standings, pairings, ratings, etc.

// ------------------------------
// Standings shared types
// ------------------------------
export type PlayerID = string;

export enum MatchResult {
  WIN = "W",
  LOSS = "L",
  DRAW = "D",
  BYE = "BYE",
  FORFEIT_WIN = "FORFEIT_W",
  FORFEIT_LOSS = "FORFEIT_L",
}

export interface Match {
  id: string;
  round: number;
  playerId: PlayerID;
  opponentId: PlayerID | null; // null → bye
  result: MatchResult;

  // Keep these required if your engines expect them; flip to optional if you adopted lenient ingestion
  gameWins: number;
  gameLosses: number;
  gameDraws: number;

  // Optional per-match extras
  opponentGameWins?: number;
  opponentGameLosses?: number;
  opponentGameDraws?: number;
  penalties?: number;
}

export interface StandingRow {
  rank: number;
  playerId: PlayerID;

  // Primary points and tie-breakers
  matchPoints: number;
  mwp: number;   // Match Win %
  omwp: number;  // Opponents’ Match Win %
  gwp: number;   // Game Win %
  ogwp: number;  // Opponents’ Game Win %
  sb: number;    // Sonneborn–Berger

  // Record summary
  wins: number;
  losses: number;
  draws: number;
  byes: number;
  roundsPlayed: number;

  // Game-level aggregates
  gameWins: number;
  gameLosses: number;
  gameDraws: number;

  penalties: number;
  opponents: PlayerID[];
}

// ---- Options shared helpers ----
export interface PointsConfig {
  win?: number;
  draw?: number;
  loss?: number;
  bye?: number;
}

export interface TiebreakFloors {
  /** Minimum floor applied to opponent percentages (e.g., 0.33). */
  opponentPctFloor?: number;
}

/**
 * Virtual-bye configuration for opponent-based tiebreakers.
 * When enabled, each BYE contributes a synthetic opponent with the given
 * percentages to OMW%/OGWP averages ONLY (no effect on ELO, SB, etc.).
 * Defaults: disabled; mwp=0.5; gwp=0.5.
 */
export interface TiebreakVirtualByeOptions {
  /** Enable treating BYEs as virtual opponents for OMW%/OGWP (default: false). */
  enabled?: boolean;
  /** MWP (0..1) to attribute to the virtual opponent (default: 0.5). */
  mwp?: number;
  /** GWP (0..1) to attribute to the virtual opponent (default: 0.5). */
  gwp?: number;
}

// ---- Swiss standings options ----
export interface ComputeSwissOptions {
  /** Seed for deterministic fallbacks in tie resolution. */
  eventId?: string;
  /** Whether to apply head-to-head ordering inside tied blocks (default true). */
  applyHeadToHead?: boolean;
  /** Floors for opponent-based percentages (default { opponentPctFloor: 0.33 }). */
  tiebreakFloors?: TiebreakFloors;
  /** Match points mapping (default 3/1/0/3). */
  points?: PointsConfig;
  /** If true, auto-create the opponent's row when only one side of a match is present. */
  acceptSingleEntryMatches?: boolean;

  /**
   * Optional: treat each BYE as a virtual opponent with fixed MWP/GWP
   * for OMW%/OGWP calculations only. Default: disabled.
   * Example: { enabled: true, mwp: 0.5, gwp: 0.5 }
   */
  tiebreakVirtualBye?: TiebreakVirtualByeOptions;
}

// ---- Round-robin standings options ----
export interface ComputeRoundRobinOptions {
  /** Seed for deterministic fallbacks if needed. */
  eventId?: string;
  /** Included for parity; RR engine may ignore this. */
  applyHeadToHead?: boolean;
  /** Floors for opponent-based percentages (default { opponentPctFloor: 0.33 }). */
  tiebreakFloors?: TiebreakFloors;
  /** Match points mapping (default 3/1/0/3). */
  points?: PointsConfig;
  /**
   * If true, accept a single row per pairing (only one player's perspective)
   * and synthesize the missing opposite row automatically.
   * Default: false (expect both directions to be present).
   */
  acceptSingleEntryMatches?: boolean;

  /**
   * Optional: same behavior as Swiss — virtual BYE contribution to OMW%/OGWP only.
   * Default: disabled.
   */
  tiebreakVirtualBye?: TiebreakVirtualByeOptions;
}

// ---- Single elimination standings ----
export interface ComputeSingleEliminationOptions {
  /** Deterministic fallback key, same idea as Swiss. */
  eventId?: string;
  /**
   * Used to break ties between players eliminated in the same round.
   * Lower = better (e.g. Swiss rank).
   */
  seeding?: Record<PlayerID, number>;
  /**
   * If you have a 3rd-place match in the data and want the function
   * to honor it.
   */
  useBronzeMatch?: boolean;
}

/**
 * Single-elim rows always have the regular standing shape
 * PLUS the round they reached / were eliminated in.
 */
export interface SingleEliminationStandingRow extends StandingRow {
  /** e.g. maxRound+1 for champion, or the round they lost in */
  eliminationRound: number;

  /** @deprecated Use `eliminationRound` instead. Included for backwards compat. */
  elimRound?: number;
}

// ------------------------------
// Public API re-exports
// ------------------------------

// Standings engines (adjust paths to your project layout)
export {
  computeStandings,
  type ComputeStandingsRequest, // if you expose a unified request type
} from './standings'; // <- your dispatcher module (if different, change path)

// Pairings facade + modes
export {
  generatePairings,
  generatePairingsDeprecated,
  type PairingMode,
  type PairingRequest,
  type PairingResult,
} from './pairings';

// Swiss pairing specific (optional, already reachable via ./pairings)
export {
  generateSwissPairings,
  type SwissPairingOptions,
  type SwissPairingResult,
} from './pairings/swiss';

// Round-robin pairing specific (optional re-exports)
export {
  buildRoundRobinSchedule,
  getRoundRobinRound,
  type RoundRobinOptions,
  type RoundDefinition,
} from './pairings/roundrobin';

// Single-elimination pairing utilities
export {
  generateSingleEliminationBracket,
  applyResult,
  autoAdvanceByes,
  seedPositions,
  type SeedEntry as SingleElimSeedEntry,
  type Bracket as SingleElimBracket,
} from './pairings/singleelimination';

// Ratings (if you export them from a ratings module)
export {
  updateEloRatings,
  type EloOptions,
} from './ratings'; // change path if needed
