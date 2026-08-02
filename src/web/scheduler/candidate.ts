import type { ComparisonPoolPlayer } from "../../data/comparisonPool.js";
import type { Ratings } from "../../domain/types.js";
import { SCHEDULER_CONFIG } from "./config.js";
import { recentPlayerPenalty } from "./history.js";
import type { Matchup } from "./types.js";
import { eloSimilarityInfluence, prefersExactlyOneFeatured, prominenceInfluence, usesEloSimilarityPreference } from "./weights.js";

export interface CoverageScore {
  unseenPlayers: number;
  maximumComparisons: number;
  combinedComparisons: number;
}

export interface SoftScore {
  total: number;
  featuredPlayers: number;
  prominenceInfluence: number;
  eloSimilarityInfluence: number;
  eloDifference: number;
}

export function scoreCoverage(matchup: Matchup, ratings: Ratings): CoverageScore {
  const a = ratings[matchup.playerAId].comparisons;
  const b = ratings[matchup.playerBId].comparisons;
  return {
    unseenPlayers: Number(a === 0) + Number(b === 0),
    maximumComparisons: Math.max(a, b),
    combinedComparisons: a + b,
  };
}

export function compareCoverage(a: CoverageScore, b: CoverageScore): number {
  return b.unseenPlayers - a.unseenPlayers ||
    a.maximumComparisons - b.maximumComparisons ||
    a.combinedComparisons - b.combinedComparisons;
}

export function withinCoverageBand(matchup: Matchup, ratings: Ratings, minimum: number): boolean {
  const limit = minimum + SCHEDULER_CONFIG.coverageComparisonBand;
  return ratings[matchup.playerAId].comparisons <= limit && ratings[matchup.playerBId].comparisons <= limit;
}

export function scoreSoftPreferences(
  matchup: Matchup,
  playersById: ReadonlyMap<string, ComparisonPoolPlayer>,
  featuredById: ReadonlyMap<string, boolean>,
  ratings: Ratings,
  completedComparisons: number,
  recentPlayers: readonly string[],
): SoftScore {
  const playerA = playersById.get(matchup.playerAId)!;
  const playerB = playersById.get(matchup.playerBId)!;
  const featuredPlayers = Number(featuredById.get(playerA.id)) + Number(featuredById.get(playerB.id));
  const prominence = prominenceInfluence(completedComparisons);
  const preferredFeaturedCount = prefersExactlyOneFeatured(completedComparisons) ? 1 : 0;
  const prominenceFit = featuredPlayers === preferredFeaturedCount ? 1 : featuredPlayers === 2 ? -0.5 : 0;
  const eloDifference = Math.abs(ratings[playerA.id].elo - ratings[playerB.id].elo);
  const similarity = 1 / (1 + eloDifference / 100);
  const eloInfluence = eloSimilarityInfluence(completedComparisons) *
    Number(usesEloSimilarityPreference(completedComparisons));
  const connectivity = Number(playerA.teamId !== playerB.teamId) * 0.67 +
    Number(playerA.positionGroup !== playerB.positionGroup) * 0.33;
  const weights = SCHEDULER_CONFIG.softWeights;
  return {
    total:
      connectivity * weights.connectivity +
      similarity * eloInfluence * weights.eloSimilarity +
      prominenceFit * prominence * weights.prominence -
      recentPlayerPenalty(matchup, recentPlayers) * weights.recentPlayerPenalty,
    featuredPlayers,
    prominenceInfluence: prominence,
    eloSimilarityInfluence: eloInfluence,
    eloDifference,
  };
}
