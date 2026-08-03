import type { ComparisonPoolPlayer } from "../../data/comparisonPool.js";
import { DEFAULT_INITIAL_RATING, DEFAULT_K_FACTOR } from "../../domain/elo.js";
import { rankComparedPlayers, type BrowserSession } from "../session.js";
import { ROSTER_SNAPSHOT_DATE } from "../config.js";

export const RANKING_EXPORT_FORMAT_VERSION = 1 as const;

export interface RankingExportDataset {
  dataVersion: string;
  generatedAt: string | null;
  rosterSnapshotDate: string | null;
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

export interface RankingExportModelInput {
  session: BrowserSession;
  dataVersion: string;
  generatedAt?: string;
  product: string;
  now: Date;
  rosterSnapshotDate?: string;
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Cannot export ranking: ${label} is missing.`);
  return value;
}

function optionalText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function count(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`Cannot export ranking: ${label} is invalid.`);
  }
  return value;
}

function normalizedTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim() || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

/** JSON uses the same two-decimal display precision as the visible ranking. */
function normalizeElo(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error("Cannot export ranking: a player Elo value is invalid.");
  }
  return Number(value.toFixed(2));
}

function exportPlayer(
  entry: ReturnType<typeof rankComparedPlayers>[number],
  player: ComparisonPoolPlayer | undefined,
  rank: number,
): RankedExportPlayer {
  if (!player || player.id !== entry.player.id) {
    throw new Error("Cannot export ranking: a ranked player is missing from the comparison pool.");
  }
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

/**
 * Builds the one normalized export representation. Its ordering comes directly
 * from the existing deterministic ranking engine; it never changes session data.
 */
export function createRankingExportModel(input: RankingExportModelInput): RankingExportModel {
  const dataVersion = requiredText(input.dataVersion, "dataset version");
  const exportedAt = input.now.toISOString();
  const ranked = rankComparedPlayers(input.session);
  const playersById = new Map(input.session.players.map((player) => [player.id, player]));
  const rankedPlayers = ranked.map((entry, index) => exportPlayer(entry, playersById.get(entry.player.id), index + 1));
  const totalPlayers = input.session.players.length;
  if (!Number.isInteger(totalPlayers) || totalPlayers < rankedPlayers.length) {
    throw new Error("Cannot export ranking: player pool is invalid.");
  }

  return {
    exportFormatVersion: RANKING_EXPORT_FORMAT_VERSION,
    product: requiredText(input.product, "product name"),
    exportedAt,
    dataset: {
      dataVersion,
      generatedAt: normalizedTimestamp(input.generatedAt),
      rosterSnapshotDate: input.rosterSnapshotDate ?? ROSTER_SNAPSHOT_DATE,
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
