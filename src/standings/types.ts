// src/standings/types.ts
// Shared types for standings engines (Swiss, Round-Robin, ...)

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
  mwp: number; // Match Win %
  omwp: number; // Opponents’ Match Win %
  gwp: number; // Game Win %
  ogwp: number; // Opponents’ Game Win %
  sb: number; // Sonneborn–Berger (strength of victory)

  // Record summary
  wins: number;
  losses: number;
  draws: number;
  byes: number;
  roundsPlayed: number;

  // Game-level aggregates (for visibility)
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
}

// ---- Round-robin standings options ----
// For now, RR uses the same points and tiebreak floors; H2H may be ignored by the RR engine.
// Keeping the shape similar lets callers reuse configs across modes.
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
}
