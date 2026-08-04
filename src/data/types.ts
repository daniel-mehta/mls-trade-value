export type PositionGroup = "GK" | "DEF" | "MID" | "FWD";

export interface PlayerSeasonStats {
  season: number;
  appearances?: number;
  starts?: number;
  minutes?: number;
  goals?: number;
  assists?: number;
  xGoals?: number;
  xAssists?: number;
  keyPasses?: number;
  goalsAdded?: number;
  goalsConceded?: number;
  saves?: number;
  savePercentage?: number;
  expectedGoalsAgainst?: number;
  goalsPrevented?: number;
  cleanSheets?: number;
}

export interface StaticPlayer {
  id: string;
  name: string;
  teamId: string;
  teamName: string;
  teamAbbreviation: string;
  positionGroup: PositionGroup;
  position?: string;
  age?: number;
  baseSalary?: number;
  guaranteedCompensation?: number;
  currentSeason: PlayerSeasonStats;
  previousSeason?: PlayerSeasonStats;
  rosterProfile?: PlayerRosterProfile;
}

/** MLS roster profiles are historical compliance snapshots, never live rosters. */
export interface PlayerRosterProfile {
  snapshotDate: string;
  listedInRosterSnapshot: boolean;
  activeAtRosterSnapshot: boolean;
  snapshotTeamId: string;
  snapshotTeamName: string;
  rosterSlot?: string;
  rosterDesignation?: string;
  currentStatus?: string;
  contractThrough?: string;
  optionYears?: string[];
  permanentTransferOption?: boolean;
  internationalSlot?: boolean;
  convertibleWithTam?: boolean;
  unavailable?: boolean;
  canadianInternationalSlotExemption?: boolean;
  rosterConstructionModel?: string;
}

export type SourceSnapshotStatus = "available" | "optional-unavailable";
export type SourceSnapshotType = "api" | "repository";

/** A checksum identifies canonical parsed source content, not byte formatting. */
export interface SourceSnapshot {
  sourceId: string;
  sourceType: SourceSnapshotType;
  endpointOrRepository: string;
  season: number | null;
  retrievedAt: string | null;
  contentSha256: string | null;
  status: SourceSnapshotStatus;
  rowCount: number;
}

export interface SalaryProvenance {
  status: SourceSnapshotStatus;
  selectedSeason: number | null;
  selectedRelease: string | null;
  currency: "USD";
  selectedRecordCount: number;
}

export interface RosterSnapshotProvenance {
  sourceId: string;
  repository: string;
  releaseFilename: string;
  fileDate: string;
  snapshotDate: string;
  contentSha256: string;
  isLive: false;
  teamCount: number;
  rawRecordCount: number;
  matchedRecords: number;
  unmatchedRecords: number;
  duplicateRecordsIgnored: number;
  missingPlayerIds: number;
}

export interface OverrideProvenance {
  schemaVersion: 1;
  appliedCount: number;
  contentSha256: string;
}

export interface PlayerNormalizationRules {
  rulesVersion: "player-normalization-v1";
  displayedTeamPolicy: "current-minutes-then-previous-minutes-then-team-id";
  playerIdentityKey: "asa-player-id";
  teamIdentityKey: "asa-team-id";
  salarySelectionPolicy: "latest-valid-player-release-no-sum";
  unknownPositionPolicy: "exclude-and-report";
}

export interface PlayerDatasetAudit {
  sourceRowCounts: Record<string, number>;
  playerCount: number;
  teamCount: number;
  positionDistribution: Record<PositionGroup, number>;
  currentSeasonMultiTeamCount: number;
  crossSeasonMultiTeamCount: number;
  unmatchedSalaryCount: number;
  unknownPositionExclusionCount: number;
  rosterMatchedCount: number;
  rosterUnmatchedCount: number;
  ignoredRosterDuplicateCount: number;
  statisticalSnapshotTeamDisagreementCount: number;
  appliedRosterOverrideCount: number;
}

export interface PlayerDataset {
  schemaVersion: 3;
  humanReadableLabel: string;
  dataVersion: string;
  competition: "MLS";
  season: number;
  previousSeason: number;
  generatedAt: string;
  statisticsThrough: string | null;
  sources: SourceSnapshot[];
  salary: SalaryProvenance;
  rosterSnapshot: RosterSnapshotProvenance;
  overrides: OverrideProvenance;
  normalization: PlayerNormalizationRules;
  audit: PlayerDatasetAudit;
  players: StaticPlayer[];
}

export const CURRENT_SEASON = Number(process.env.MLS_CURRENT_SEASON ?? 2026);
export const PREVIOUS_SEASON = Number(process.env.MLS_PREVIOUS_SEASON ?? CURRENT_SEASON - 1);
export const COMPETITION = "mls" as const;

export const PLAYER_NORMALIZATION_RULES: PlayerNormalizationRules = {
  rulesVersion: "player-normalization-v1",
  displayedTeamPolicy: "current-minutes-then-previous-minutes-then-team-id",
  playerIdentityKey: "asa-player-id",
  teamIdentityKey: "asa-team-id",
  salarySelectionPolicy: "latest-valid-player-release-no-sum",
  unknownPositionPolicy: "exclude-and-report",
};

export function playerHumanReadableLabel(season: number, previousSeason: number, rosterSnapshotDate: string): string {
  return `MLS ${season}/${previousSeason} | roster snapshot ${rosterSnapshotDate}`;
}
