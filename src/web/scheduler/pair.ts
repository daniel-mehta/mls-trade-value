import type { Matchup } from "./types.js";

/** Matchups are unordered for repetition checks, even though cards have A/B sides. */
export function createPairKey(playerAId: string, playerBId: string): string {
  return [playerAId, playerBId].sort().join(":");
}

export function matchupPairKey(matchup: Matchup): string {
  return createPairKey(matchup.playerAId, matchup.playerBId);
}

export function generateCandidatePairs(playerIds: readonly string[]): Matchup[] {
  const pairs: Matchup[] = [];
  for (let first = 0; first < playerIds.length; first += 1) {
    for (let second = first + 1; second < playerIds.length; second += 1) {
      pairs.push({ playerAId: playerIds[first], playerBId: playerIds[second] });
    }
  }
  return pairs;
}

