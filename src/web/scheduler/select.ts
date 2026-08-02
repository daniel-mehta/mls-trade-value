import { compareCoverage, scoreCoverage, scoreSoftPreferences, withinCoverageBand } from "./candidate.js";
import { isFeaturedPriorityPlayer } from "./featured.js";
import { generateCandidatePairs, matchupPairKey } from "./pair.js";
import type { Matchup, MatchupSelectionDiagnostics, MatchupSelectionResult, SchedulerInput } from "./types.js";

interface ScoredCandidate {
  matchup: Matchup;
  coverage: ReturnType<typeof scoreCoverage>;
  soft: ReturnType<typeof scoreSoftPreferences>;
  randomTieBreak: number;
}

function chooseCooldownCandidates(
  candidates: readonly ScoredCandidate[],
  input: SchedulerInput,
): { candidates: ScoredCandidate[]; relaxation: MatchupSelectionDiagnostics["relaxation"] } {
  const previousKey = input.previousPair ? matchupPairKey(input.previousPair) : null;
  const recentPlayerIds = new Set(input.recentPlayers);
  const allowed = (candidate: ScoredCandidate, blockedPairs: ReadonlySet<string>, blockPlayers: boolean, blockPrevious = true) => {
    const key = matchupPairKey(candidate.matchup);
    return (!blockPrevious || key !== previousKey) &&
      !blockedPairs.has(key) &&
      (!blockPlayers || (!recentPlayerIds.has(candidate.matchup.playerAId) && !recentPlayerIds.has(candidate.matchup.playerBId)));
  };
  const allRecentPairs = new Set(input.recentPairs);
  const strict = candidates.filter((candidate) => allowed(candidate, allRecentPairs, true));
  if (strict.length) return { candidates: strict, relaxation: "none" };

  // Relaxation order is deliberate: recent-player avoidance, then oldest pair
  // cooldowns one at a time, and finally the previous pair only when it is the
  // sole possible unordered pair. Self-matchups and unknown IDs never relax.
  const withoutPlayerCooldown = candidates.filter((candidate) => allowed(candidate, allRecentPairs, false));
  if (withoutPlayerCooldown.length) return { candidates: withoutPlayerCooldown, relaxation: "recent-players" };
  for (let dropOldest = 1; dropOldest <= input.recentPairs.length; dropOldest += 1) {
    const blockedPairs = new Set(input.recentPairs.slice(dropOldest));
    const withOlderPairsRelaxed = candidates.filter((candidate) => allowed(candidate, blockedPairs, false));
    if (withOlderPairsRelaxed.length) return { candidates: withOlderPairsRelaxed, relaxation: "older-pairs" };
  }
  const validPlayerIds = new Set(input.players.filter((player) => input.ratings[player.id]).map((player) => player.id));
  return validPlayerIds.size === 2
    ? { candidates: [...candidates], relaxation: "single-pair-fallback" }
    : { candidates: [], relaxation: "older-pairs" };
}

export function selectNextMatchup(input: SchedulerInput): MatchupSelectionResult {
  const uniquePlayers = [...new Map(input.players.map((player) => [player.id, player])).values()]
    .filter((player) => input.ratings[player.id]);
  if (uniquePlayers.length < 2) return { kind: "insufficient-pool", validPlayerCount: uniquePlayers.length };
  const playersById = new Map(uniquePlayers.map((player) => [player.id, player]));
  const featuredById = new Map(uniquePlayers.map((player) => [player.id, isFeaturedPriorityPlayer(player)]));
  const minimumComparisons = Math.min(...uniquePlayers.map((player) => input.ratings[player.id].comparisons));
  const candidates = generateCandidatePairs(uniquePlayers.map((player) => player.id))
    .filter((matchup) => withinCoverageBand(matchup, input.ratings, minimumComparisons))
    .map((matchup): ScoredCandidate => ({
      matchup,
      coverage: scoreCoverage(matchup, input.ratings),
      soft: scoreSoftPreferences(matchup, playersById, featuredById, input.ratings, input.completedComparisons, input.recentPlayers),
      randomTieBreak: input.random(),
    }));
  let bestCoverage = candidates[0].coverage;
  for (let index = 1; index < candidates.length; index += 1) {
    if (compareCoverage(candidates[index].coverage, bestCoverage) < 0) {
      bestCoverage = candidates[index].coverage;
    }
  }
  const coveragePeers = candidates.filter((candidate) => compareCoverage(candidate.coverage, bestCoverage) === 0);
  let cooled = chooseCooldownCandidates(coveragePeers, input);
  if (!cooled.candidates.length) {
    // An immediately repeated pair is never worth enforcing a brittle coverage
    // tie. Broaden to the next-best coverage tier while retaining the band.
    const broadened = chooseCooldownCandidates(candidates, input);
    cooled = { candidates: broadened.candidates, relaxation: "coverage-fallback" };
  }
  const compareCandidate = (a: ScoredCandidate, b: ScoredCandidate) =>
    compareCoverage(a.coverage, b.coverage) ||
    b.soft.total - a.soft.total ||
    b.randomTieBreak - a.randomTieBreak ||
    matchupPairKey(a.matchup).localeCompare(matchupPairKey(b.matchup));
  let selected = cooled.candidates[0];
  for (let index = 1; index < cooled.candidates.length; index += 1) {
    if (compareCandidate(cooled.candidates[index], selected) < 0) selected = cooled.candidates[index];
  }
  const orientation = input.random() < 0.5
    ? selected.matchup
    : { playerAId: selected.matchup.playerBId, playerBId: selected.matchup.playerAId };
  return {
    kind: "selected",
    matchup: orientation,
    diagnostics: {
      relaxation: cooled.relaxation,
      coverage: selected.coverage,
      featuredPlayers: selected.soft.featuredPlayers,
      featuredInfluence: selected.soft.prominenceInfluence,
      eloSimilarityInfluence: selected.soft.eloSimilarityInfluence,
      eloDifference: selected.soft.eloDifference,
    },
  };
}
