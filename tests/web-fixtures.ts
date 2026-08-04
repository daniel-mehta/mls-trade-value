import type { ComparisonPool, ComparisonPoolPlayer } from "../src/data/comparisonPool.js";

export const TEST_SOURCE_VERSION = `sha256:${"a".repeat(64)}`;
export const TEST_POOL_VERSION = `sha256:${"b".repeat(64)}`;

export const testPoolProvenance = {
  sourcePlayerDataVersion: TEST_SOURCE_VERSION,
  sourcePlayerGeneratedAt: "2026-07-30T18:51:17.821Z",
  statisticsThrough: null,
  rosterSnapshotDate: "2026-02-26",
  rosterReleaseDate: "2026-02-27",
  salaryReleaseDate: "2026-04-16",
  salaryCurrency: "USD" as const,
};

export function poolPlayer(
  id: string,
  overrides: Partial<ComparisonPoolPlayer> = {},
): ComparisonPoolPlayer {
  return {
    id,
    name: `Player ${id.toUpperCase()}`,
    teamId: `team-${id}`,
    teamName: `Team ${id.toUpperCase()}`,
    teamAbbreviation: id.toUpperCase(),
    positionGroup: "MID",
    position: "AM",
    currentSeason: { season: 2026, minutes: 100, goals: 1, assists: 2 },
    selectionReasons: ["manual-inclusion"],
    ...overrides,
  };
}

export function comparisonPoolFixture(
  players: ComparisonPoolPlayer[],
  dataVersion = TEST_POOL_VERSION,
): ComparisonPool {
  const teamCounts = [...players.reduce((counts, player) => counts.set(player.teamId, (counts.get(player.teamId) ?? 0) + 1), new Map<string, number>()).values()].sort((a, b) => a - b);
  const middle = Math.floor(teamCounts.length / 2);
  return {
    schemaVersion: 3,
    humanReadableLabel: "Comparison pool | MLS 2026/2025 | roster snapshot 2026-02-26",
    dataVersion,
    sourceDataVersion: TEST_SOURCE_VERSION,
    season: 2026,
    previousSeason: 2025,
    generatedAt: "2026-08-01T00:00:00.000Z",
    provenance: { ...testPoolProvenance },
    selectionRules: {
      eligibilityCurrentSeasonMinutesGreaterThan: 0,
      previousSeasonFallbackRequiresRosterSnapshot: true,
      unavailablePlayersExcluded: false,
      baseOutfieldPlayersPerTeam: 5,
      baseGoalkeepersPerTeam: 1,
      previousSeasonMinutesWeight: 0.5,
      participationScoreFormula: "current-minutes + previous-minutes * 0.5",
      currentSeasonGoalContributionThreshold: 5,
      designationInclusions: ["Designated Player", "U22 Initiative"],
      tieBreakers: ["participation-score-desc", "current-minutes-desc", "previous-minutes-desc", "asa-player-id-asc"],
      manualInclusionsEligibilityBound: true,
      exclusionsTakePrecedence: true,
    },
    overrides: { schemaVersion: 1, includeCount: 0, excludeCount: 0, contentSha256: "c".repeat(64) },
    audit: {
      eligiblePlayerCount: players.length,
      finalPoolSize: players.length,
      selectionReasonCounts: {
        "team-outfield-selection": 0,
        "team-goalkeeper-selection": 0,
        "designated-player": 0,
        "u22-initiative": 0,
        "current-season-five-goal-contributions": 0,
        "manual-inclusion": players.length,
      },
      positionDistribution: {
        GK: players.filter((player) => player.positionGroup === "GK").length,
        DEF: players.filter((player) => player.positionGroup === "DEF").length,
        MID: players.filter((player) => player.positionGroup === "MID").length,
        FWD: players.filter((player) => player.positionGroup === "FWD").length,
      },
      teamRepresentation: {
        teamCount: teamCounts.length,
        minimum: teamCounts.length ? Math.min(...teamCounts) : 0,
        maximum: teamCounts.length ? Math.max(...teamCounts) : 0,
        median: teamCounts.length ? teamCounts.length % 2 ? teamCounts[middle] : (teamCounts[middle - 1] + teamCounts[middle]) / 2 : 0,
      },
    },
    players,
  };
}

export function zeroRandom(): number {
  return 0;
}

export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
