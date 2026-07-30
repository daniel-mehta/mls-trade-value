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
}

export interface PlayerDataset {
  schemaVersion: 1;
  dataVersion: string;
  competition: "MLS";
  season: number;
  previousSeason: number;
  generatedAt: string;
  sources: Array<{ name: string; url?: string }>;
  players: StaticPlayer[];
}

export const CURRENT_SEASON = Number(process.env.MLS_CURRENT_SEASON ?? 2026);
export const PREVIOUS_SEASON = Number(process.env.MLS_PREVIOUS_SEASON ?? CURRENT_SEASON - 1);
export const COMPETITION = "mls" as const;
