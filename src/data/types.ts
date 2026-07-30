/** The deliberately small, browser-facing snapshot produced by Phase 2A. */
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
  snapshotDate: string; listedInRosterSnapshot: boolean; activeAtRosterSnapshot: boolean;
  snapshotTeamId: string; snapshotTeamName: string; rosterSlot?: string; rosterDesignation?: string;
  currentStatus?: string; contractThrough?: string; optionYears?: string[]; permanentTransferOption?: boolean;
  internationalSlot?: boolean; convertibleWithTam?: boolean; unavailable?: boolean;
  canadianInternationalSlotExemption?: boolean; rosterConstructionModel?: string;
}

export interface PlayerDataset {
  schemaVersion: 1 | 2;
  dataVersion: string;
  competition: "MLS";
  season: number;
  previousSeason: number;
  generatedAt: string;
  sources: Array<{ name: string; url?: string }>;
  rosterSnapshot?: { releaseDate: string; sourceName: string; isLive: false; totalRecords?: number; unmatchedRecords?: number; duplicateRecordsIgnored?: number; missingPlayerIds?: number };
  manualOverridesApplied?: number;
  players: StaticPlayer[];
}

export const CURRENT_SEASON = Number(process.env.MLS_CURRENT_SEASON ?? 2026);
export const PREVIOUS_SEASON = Number(process.env.MLS_PREVIOUS_SEASON ?? CURRENT_SEASON - 1);
export const COMPETITION = "mls" as const;
