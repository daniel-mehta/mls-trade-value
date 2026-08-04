import { computePlayerDataVersion, sha256Canonical } from "../src/data/semanticVersion.js";
import {
  PLAYER_NORMALIZATION_RULES,
  playerHumanReadableLabel,
  type PlayerDataset,
  type SourceSnapshot,
  type StaticPlayer,
} from "../src/data/types.js";

const CHECKSUM = "a".repeat(64);

export function staticPlayer(id = "a", overrides: Partial<StaticPlayer> = {}): StaticPlayer {
  return {
    id,
    name: `Player ${id}`,
    teamId: "t",
    teamName: "Team",
    teamAbbreviation: "T",
    positionGroup: "MID",
    currentSeason: { season: 2026, minutes: 1 },
    ...overrides,
  };
}

function source(sourceId: string, season: number | null, rowCount = 1): SourceSnapshot {
  return {
    sourceId,
    sourceType: sourceId === "asa-roster-profiles" ? "repository" : "api",
    endpointOrRepository: `https://example.test/${sourceId}`,
    season,
    retrievedAt: null,
    contentSha256: CHECKSUM,
    status: "available",
    rowCount,
  };
}

export function playerDataset(players: StaticPlayer[], changes: Partial<PlayerDataset> = {}): PlayerDataset {
  const season = changes.season ?? 2026;
  const previousSeason = changes.previousSeason ?? 2025;
  const rosterDate = changes.rosterSnapshot?.snapshotDate ?? "2026-02-26";
  const sources = changes.sources ?? [
    source("asa-players", null),
    source("asa-teams", null),
    source(`asa-xgoals-${season}`, season),
    source(`asa-xpass-${season}`, season),
    source(`asa-goals-added-${season}`, season),
    source(`asa-salaries-${season}`, season),
    source(`asa-xgoals-${previousSeason}`, previousSeason),
    source(`asa-xpass-${previousSeason}`, previousSeason),
    source(`asa-goals-added-${previousSeason}`, previousSeason),
    source(`asa-salaries-${previousSeason}`, previousSeason),
    source("asa-roster-profiles", season, players.filter((player) => player.rosterProfile).length),
  ];
  const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
  const sortedPlayers = [...players].sort((a, b) => compare(a.name, b.name) || compare(a.id, b.id));
  const rosterMatched = sortedPlayers.filter((player) => player.rosterProfile).length;
  const teamCount = new Set(sortedPlayers.map((player) => player.teamId)).size;
  const dataset: PlayerDataset = {
    schemaVersion: 3,
    humanReadableLabel: playerHumanReadableLabel(season, previousSeason, rosterDate),
    dataVersion: "",
    competition: "MLS",
    season,
    previousSeason,
    generatedAt: "2026-07-30T18:51:17.821Z",
    statisticsThrough: null,
    sources,
    salary: { status: "available", selectedSeason: null, selectedRelease: null, currency: "USD", selectedRecordCount: 0 },
    rosterSnapshot: {
      sourceId: "asa-roster-profiles",
      repository: "https://example.test/rosters",
      releaseFilename: "2026-02-27.json",
      fileDate: "2026-02-27",
      snapshotDate: rosterDate,
      contentSha256: CHECKSUM,
      isLive: false,
      teamCount,
      rawRecordCount: rosterMatched,
      matchedRecords: rosterMatched,
      unmatchedRecords: 0,
      duplicateRecordsIgnored: 0,
      missingPlayerIds: 0,
    },
    overrides: { schemaVersion: 1, appliedCount: 0, contentSha256: sha256Canonical({ schemaVersion: 1, overrides: [] }) },
    normalization: PLAYER_NORMALIZATION_RULES,
    audit: {
      sourceRowCounts: Object.fromEntries(sources.map((entry) => [entry.sourceId, entry.rowCount])),
      playerCount: sortedPlayers.length,
      teamCount,
      positionDistribution: {
        GK: sortedPlayers.filter((player) => player.positionGroup === "GK").length,
        DEF: sortedPlayers.filter((player) => player.positionGroup === "DEF").length,
        MID: sortedPlayers.filter((player) => player.positionGroup === "MID").length,
        FWD: sortedPlayers.filter((player) => player.positionGroup === "FWD").length,
      },
      currentSeasonMultiTeamCount: 0,
      crossSeasonMultiTeamCount: 0,
      unmatchedSalaryCount: 0,
      unknownPositionExclusionCount: 0,
      rosterMatchedCount: rosterMatched,
      rosterUnmatchedCount: 0,
      ignoredRosterDuplicateCount: 0,
      statisticalSnapshotTeamDisagreementCount: sortedPlayers.filter((player) => player.rosterProfile && player.teamId !== player.rosterProfile.snapshotTeamId).length,
      appliedRosterOverrideCount: 0,
    },
    players: sortedPlayers,
    ...changes,
  };
  dataset.dataVersion = computePlayerDataVersion(dataset);
  return dataset;
}
