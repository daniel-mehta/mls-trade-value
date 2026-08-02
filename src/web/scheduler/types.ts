import type { ComparisonPoolPlayer } from "../../data/comparisonPool.js";
import type { Ratings } from "../../domain/types.js";

export interface Matchup {
  playerAId: string;
  playerBId: string;
}

export type RandomSource = () => number;

export interface SchedulerInput {
  players: readonly ComparisonPoolPlayer[];
  ratings: Ratings;
  completedComparisons: number;
  recentPlayers: readonly string[];
  recentPairs: readonly string[];
  previousPair: Matchup | null;
  random: RandomSource;
}

export interface MatchupSelectionDiagnostics {
  relaxation: "none" | "recent-players" | "older-pairs" | "coverage-fallback" | "single-pair-fallback";
  coverage: {
    unseenPlayers: number;
    maximumComparisons: number;
    combinedComparisons: number;
  };
  featuredPlayers: number;
  featuredInfluence: number;
  eloSimilarityInfluence: number;
  eloDifference: number;
}

export type MatchupSelectionResult =
  | { kind: "selected"; matchup: Matchup; diagnostics: MatchupSelectionDiagnostics }
  | { kind: "insufficient-pool"; validPlayerCount: number };
