import { SCHEDULER_CONFIG } from "./config.js";
import { createPairKey, matchupPairKey } from "./pair.js";
import type { Matchup } from "./types.js";

export function appendMatchupHistory(
  recentPairs: readonly string[],
  recentPlayers: readonly string[],
  matchup: Matchup,
): { recentPairs: string[]; recentPlayers: string[] } {
  const pair = matchupPairKey(matchup);
  return {
    recentPairs: [...recentPairs.filter((key) => key !== pair), pair].slice(-SCHEDULER_CONFIG.recentPairLimit),
    recentPlayers: [...recentPlayers, matchup.playerAId, matchup.playerBId].slice(-SCHEDULER_CONFIG.recentPlayerLimit),
  };
}

export function recentPlayerPenalty(matchup: Matchup, recentPlayers: readonly string[]): number {
  if (!recentPlayers.length) return 0;
  const ids = new Set([matchup.playerAId, matchup.playerBId]);
  return recentPlayers.reduce((total, id, index) => {
    if (!ids.has(id)) return total;
    return total + (index + 1) / recentPlayers.length;
  }, 0);
}

export function sanitizeRecentPlayers(history: readonly string[], validIds: ReadonlySet<string>): string[] {
  return history.filter((id) => validIds.has(id)).slice(-SCHEDULER_CONFIG.recentPlayerLimit);
}

export function sanitizeRecentPairs(history: readonly string[], validIds: ReadonlySet<string>): string[] {
  const validKeys = new Set<string>();
  const ids = [...validIds];
  for (let first = 0; first < ids.length; first += 1) {
    for (let second = first + 1; second < ids.length; second += 1) {
      validKeys.add(createPairKey(ids[first], ids[second]));
    }
  }
  const latestUnique: string[] = [];
  for (const key of history) {
    if (!validKeys.has(key)) continue;
    const prior = latestUnique.indexOf(key);
    if (prior >= 0) latestUnique.splice(prior, 1);
    latestUnique.push(key);
  }
  return latestUnique.slice(-SCHEDULER_CONFIG.recentPairLimit);
}

