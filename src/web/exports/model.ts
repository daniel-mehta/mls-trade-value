import type { ComparisonPoolPlayer, ComparisonPoolProvenance } from "../../data/comparisonPool.js";
import { DEFAULT_INITIAL_RATING, DEFAULT_K_FACTOR } from "../../domain/elo.js";
import { rankComparedPlayers, type BrowserSession } from "../session.js";

export const RANKING_EXPORT_FORMAT_VERSION = 2 as const;

export interface RankingExportDataset {
  sourcePlayerDataVersion: string;
  comparisonPoolDataVersion: string;
  playerArtifactBuiltAt: string | null;
  comparisonPoolArtifactBuiltAt: string | null;
  statisticsThrough: string | null;
  rosterSnapshotDate: string | null;
  rosterReleaseDate: string | null;
  salaryReleaseDate: string | null;
  salaryCurrency: string | null;
}

export interface RankedExportPlayer {
  rank: number;
  playerId: string;
  playerName: string;
  teamId: string;
  teamAbbreviation: string;
  teamName: string;
  positionGroup: string;
  detailedPosition: string;
  elo: number;
  wins: number;
  losses: number;
  comparisons: number;
}

export interface RankingExportModel {
  exportFormatVersion: typeof RANKING_EXPORT_FORMAT_VERSION;
  product: string;
  exportedAt: string;
  dataset: RankingExportDataset;
  elo: { initialRating: number; kFactor: number };
  summary: {
    rankedPlayers: number;
    unrankedPlayers: number;
    completedComparisons: number;
    skippedComparisons: number;
  };
  rankedPlayers: RankedExportPlayer[];
}

export interface RankingExportMetadata {
  dataVersion: string;
  generatedAt?: string;
  provenance: ComparisonPoolProvenance;
}

export interface RankingExportModelInput {
  session: BrowserSession;
  metadata: RankingExportMetadata;
  product: string;
  now: Date;
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Cannot export ranking: ${label} is missing.`);
  return value;
}

function optionalText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function count(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) throw new Error(`Cannot export ranking: ${label} is invalid.`);
  return value;
}

function normalizedTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim() || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

function normalizedDate(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value ? value : null;
}

function normalizeElo(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("Cannot export ranking: a player Elo value is invalid.");
  return Number(value.toFixed(2));
}

function exportPlayer(entry: ReturnType<typeof rankComparedPlayers>[number], player: ComparisonPoolPlayer | undefined, rank: number): RankedExportPlayer {
  if (!player || player.id !== entry.player.id) throw new Error("Cannot export ranking: a ranked player is missing from the comparison pool.");
  return {
    rank,
    playerId: requiredText(player.id, "ASA player ID"),
    playerName: requiredText(player.name, "player name"),
    teamId: requiredText(player.teamId, "team ID"),
    teamAbbreviation: optionalText(player.teamAbbreviation),
    teamName: requiredText(player.teamName, "team name"),
    positionGroup: requiredText(player.positionGroup, "position group"),
    detailedPosition: optionalText(player.position),
    elo: normalizeElo(entry.elo),
    wins: count(entry.wins, "wins"),
    losses: count(entry.losses, "losses"),
    comparisons: count(entry.comparisons, "comparisons"),
  };
}

/** Builds the normalized export without changing ranking order or session state. */
export function createRankingExportModel(input: RankingExportModelInput): RankingExportModel {
  const exportedAt = input.now.toISOString();
  const ranked = rankComparedPlayers(input.session);
  const playersById = new Map(input.session.players.map((player) => [player.id, player]));
  const rankedPlayers = ranked.map((entry, index) => exportPlayer(entry, playersById.get(entry.player.id), index + 1));
  const totalPlayers = input.session.players.length;
  if (!Number.isInteger(totalPlayers) || totalPlayers < rankedPlayers.length) throw new Error("Cannot export ranking: player pool is invalid.");
  const provenance = input.metadata.provenance;
  return {
    exportFormatVersion: RANKING_EXPORT_FORMAT_VERSION,
    product: requiredText(input.product, "product name"),
    exportedAt,
    dataset: {
      sourcePlayerDataVersion: requiredText(provenance.sourcePlayerDataVersion, "source player data version"),
      comparisonPoolDataVersion: requiredText(input.metadata.dataVersion, "comparison-pool data version"),
      playerArtifactBuiltAt: normalizedTimestamp(provenance.sourcePlayerGeneratedAt),
      comparisonPoolArtifactBuiltAt: normalizedTimestamp(input.metadata.generatedAt),
      statisticsThrough: normalizedDate(provenance.statisticsThrough),
      rosterSnapshotDate: normalizedDate(provenance.rosterSnapshotDate),
      rosterReleaseDate: normalizedDate(provenance.rosterReleaseDate),
      salaryReleaseDate: normalizedDate(provenance.salaryReleaseDate),
      salaryCurrency: optionalText(provenance.salaryCurrency) || null,
    },
    elo: { initialRating: DEFAULT_INITIAL_RATING, kFactor: DEFAULT_K_FACTOR },
    summary: {
      rankedPlayers: rankedPlayers.length,
      unrankedPlayers: totalPlayers - rankedPlayers.length,
      completedComparisons: count(input.session.completedComparisons, "completed comparisons"),
      skippedComparisons: count(input.session.skippedMatchups, "skipped comparisons"),
    },
    rankedPlayers,
  };
}
