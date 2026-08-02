import { SCHEDULER_CONFIG } from "./config.js";

function linearDecay(value: number, fullThrough: number, endsAt: number): number {
  if (value <= fullThrough) return 1;
  if (value >= endsAt) return 0;
  return 1 - (value - fullThrough) / (endsAt - fullThrough);
}

export function prominenceInfluence(completedComparisons: number): number {
  return linearDecay(
    completedComparisons,
    SCHEDULER_CONFIG.prominenceFullThrough,
    SCHEDULER_CONFIG.prominenceEndsAt,
  );
}

export function eloSimilarityInfluence(completedComparisons: number): number {
  const { eloSimilarityStartsAt, eloSimilarityFullAt } = SCHEDULER_CONFIG;
  if (completedComparisons <= eloSimilarityStartsAt) return 0;
  if (completedComparisons >= eloSimilarityFullAt) return 1;
  return (completedComparisons - eloSimilarityStartsAt) /
    (eloSimilarityFullAt - eloSimilarityStartsAt);
}

/** A distributed 13-of-20 pattern makes the early 65% aim deterministic and testable. */
export function prefersExactlyOneFeatured(completedComparisons: number): boolean {
  const rate = SCHEDULER_CONFIG.earlyProminenceRate;
  const offset = 0.5;
  return Math.floor((completedComparisons + 1) * rate + offset) >
    Math.floor(completedComparisons * rate + offset);
}

/** Leaves one in five later selections open for cross-ranking bridge matchups. */
export function usesEloSimilarityPreference(completedComparisons: number): boolean {
  const rate = SCHEDULER_CONFIG.lateSimilarityPreferenceRate;
  const offset = 0.5;
  return Math.floor((completedComparisons + 1) * rate + offset) >
    Math.floor(completedComparisons * rate + offset);
}
