// src/index.ts

// ──────────────────────────────────────────────────────────────
// Standings (facade + engines + core types)
// Re-export from the standings barrel so users don’t need deep paths.
// ──────────────────────────────────────────────────────────────
export {
  // Facade
  computeStandings,
  type ComputeStandingsRequest,
  type ComputeStandingsOptions,
  type StandingsMode,

  // Engines
  computeSwissStandings,
  type ComputeSwissOptions,
  computeRoundRobinStandings,
  type ComputeRoundRobinOptions,

  // Core types
  type PlayerID,
  type Match,
  type StandingRow,
  MatchResult,
} from './standings';

// ──────────────────────────────────────────────────────────────
// Pairings (facade + swiss + round-robin helpers)
// ──────────────────────────────────────────────────────────────
export {
  // Facade
  generatePairings,
  type PairingMode,
  type PairingRequest,
  type PairingResult,

  // Swiss engine (direct export for convenience)
  generateSwissPairings,
  type SwissPairingOptions,
  type SwissPairingResult,

  // Round-robin helpers
  buildRoundRobinSchedule,
  getRoundRobinRound,
  type RoundRobinOptions,
  type RoundDefinition,
} from './pairings';

// ──────────────────────────────────────────────────────────────
// Ratings (ELO now, room for others later)
// NOTE: Ensure ./ratings/index.ts actually exports `updateRatings`
// (generic facade). If you haven’t added it yet, remove that export
// line or alias it to ELO inside ./ratings/index.ts.
// ──────────────────────────────────────────────────────────────
export {
  // Generic facade (if implemented in ./ratings/index.ts)
  updateRatings,

  // ELO
  updateEloRatings,
  expectedScore,
  type EloMatch,
  type EloOptions,
  type EloUpdateResult,
  type EloResult,
} from './ratings';
