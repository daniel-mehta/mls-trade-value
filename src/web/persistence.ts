import { DEFAULT_INITIAL_RATING } from "../domain/elo.js";
import type { PlayerRating, Ratings } from "../domain/types.js";
import type { ComparisonPool } from "../data/comparisonPool.js";
import {
  initializeBrowserSession,
  selectNextMatchup,
  type BrowserSession,
  type Matchup,
  type RandomSource,
} from "./session.js";

export const PERSISTED_RANKING_SCHEMA_VERSION = 1 as const;
const MIN_ELO = 0;
const MAX_ELO = 3000;

export interface PersistedRating {
  playerId: string;
  rating: number;
  wins: number;
  losses: number;
  comparisons: number;
}

export interface PersistedRankingState {
  schemaVersion: typeof PERSISTED_RANKING_SCHEMA_VERSION;
  datasetVersion: string;
  savedAt: string;
  ratings: PersistedRating[];
  completedComparisons: number;
  skippedComparisons: number;
  matchupState: {
    currentPair: [string, string] | null;
    remainingQueue: string[];
    previousPair: [string, string] | null;
  };
}

export type PersistedValidationResult =
  | { kind: "valid"; state: PersistedRankingState }
  | { kind: "invalid"; reason: string };

export type RestoreResult =
  | { kind: "restored"; session: BrowserSession }
  | { kind: "reconciled"; session: BrowserSession }
  | { kind: "invalid"; reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isIsoTimestamp(value: unknown): value is string {
  return isNonEmptyString(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

function parsePair(value: unknown, label: string): [string, string] | null | undefined {
  if (value === null) return null;
  if (!Array.isArray(value) || value.length !== 2 || !value.every(isNonEmptyString)) return undefined;
  if (value[0] === value[1]) return undefined;
  return [value[0], value[1]];
}

/** Parses all untrusted localStorage content before it reaches session code. */
export function validatePersistedRankingState(value: unknown): PersistedValidationResult {
  if (!isRecord(value)) return { kind: "invalid", reason: "Saved value is not an object." };
  if (value.schemaVersion !== PERSISTED_RANKING_SCHEMA_VERSION) return { kind: "invalid", reason: "Unsupported schema version." };
  if (!isNonEmptyString(value.datasetVersion)) return { kind: "invalid", reason: "Missing dataset version." };
  if (!isIsoTimestamp(value.savedAt)) return { kind: "invalid", reason: "Invalid save timestamp." };
  if (!Array.isArray(value.ratings) || !isCount(value.completedComparisons) || !isCount(value.skippedComparisons) || !isRecord(value.matchupState)) {
    return { kind: "invalid", reason: "Saved ranking has malformed fields." };
  }
  const ids = new Set<string>();
  const ratings: PersistedRating[] = [];
  for (const candidate of value.ratings) {
    if (!isRecord(candidate) || !isNonEmptyString(candidate.playerId) || ids.has(candidate.playerId) ||
      typeof candidate.rating !== "number" || !Number.isFinite(candidate.rating) || candidate.rating < MIN_ELO || candidate.rating > MAX_ELO ||
      !isCount(candidate.wins) || !isCount(candidate.losses) || !isCount(candidate.comparisons) ||
      candidate.comparisons !== candidate.wins + candidate.losses) {
      return { kind: "invalid", reason: "Saved player ratings are invalid." };
    }
    ids.add(candidate.playerId);
    ratings.push({ playerId: candidate.playerId, rating: candidate.rating, wins: candidate.wins, losses: candidate.losses, comparisons: candidate.comparisons });
  }
  if (ratings.reduce((total, rating) => total + rating.wins, 0) !== value.completedComparisons ||
      ratings.reduce((total, rating) => total + rating.losses, 0) !== value.completedComparisons ||
      ratings.reduce((total, rating) => total + rating.comparisons, 0) !== value.completedComparisons * 2) {
    return { kind: "invalid", reason: "Saved aggregate totals are impossible." };
  }
  const currentPair = parsePair(value.matchupState.currentPair, "current");
  const previousPair = parsePair(value.matchupState.previousPair, "previous");
  if (currentPair === undefined || previousPair === undefined || !Array.isArray(value.matchupState.remainingQueue) || !value.matchupState.remainingQueue.every(isNonEmptyString)) {
    return { kind: "invalid", reason: "Saved matchup state is invalid." };
  }
  const queue = value.matchupState.remainingQueue;
  if (new Set(queue).size !== queue.length) return { kind: "invalid", reason: "Saved matchup queue contains duplicates." };
  return { kind: "valid", state: { schemaVersion: PERSISTED_RANKING_SCHEMA_VERSION, datasetVersion: value.datasetVersion, savedAt: value.savedAt, ratings, completedComparisons: value.completedComparisons, skippedComparisons: value.skippedComparisons, matchupState: { currentPair, remainingQueue: [...queue], previousPair } } };
}

export function deserializePersistedRankingState(raw: string): PersistedValidationResult {
  try {
    return validatePersistedRankingState(JSON.parse(raw));
  } catch {
    return { kind: "invalid", reason: "Saved value is not valid JSON." };
  }
}

export function createPersistedRankingState(session: BrowserSession, datasetVersion: string, savedAt = new Date().toISOString()): PersistedRankingState {
  return {
    schemaVersion: PERSISTED_RANKING_SCHEMA_VERSION,
    datasetVersion,
    savedAt,
    ratings: Object.values(session.ratings).map((rating) => ({ playerId: rating.playerId, rating: rating.elo, wins: rating.wins, losses: rating.losses, comparisons: rating.comparisons })).sort((a, b) => a.playerId.localeCompare(b.playerId)),
    completedComparisons: session.completedComparisons,
    skippedComparisons: session.skippedMatchups,
    matchupState: {
      currentPair: session.currentMatchup ? [session.currentMatchup.playerAId, session.currentMatchup.playerBId] : null,
      remainingQueue: session.queue.slice(session.queueIndex),
      previousPair: session.previousMatchup ? [session.previousMatchup.playerAId, session.previousMatchup.playerBId] : null,
    },
  };
}

export function serializePersistedRankingState(session: BrowserSession, datasetVersion: string, savedAt?: string): string {
  return JSON.stringify(createPersistedRankingState(session, datasetVersion, savedAt));
}

function asMatchup(pair: [string, string] | null): Matchup | null {
  return pair ? { playerAId: pair[0], playerBId: pair[1] } : null;
}

function validPair(pair: [string, string] | null, ids: Set<string>): pair is [string, string] {
  if (!pair) return false;
  return pair[0] !== pair[1] && ids.has(pair[0]) && ids.has(pair[1]);
}

/** Restores normalized records directly; it deliberately never replays votes. */
export function restoreBrowserSession(pool: ComparisonPool, saved: PersistedRankingState, random: RandomSource = Math.random): RestoreResult {
  const fresh = initializeBrowserSession(pool.players, random);
  const validIds = new Set(fresh.eloPlayers.map((player) => player.id));
  const datasetChanged = saved.datasetVersion !== pool.dataVersion;
  const savedIds = new Set(saved.ratings.map((rating) => rating.playerId));
  if (!datasetChanged && (savedIds.size !== validIds.size || [...savedIds].some((id) => !validIds.has(id)))) {
    return { kind: "invalid", reason: "Saved ratings do not match this player pool." };
  }
  const unknownQueueId = saved.matchupState.remainingQueue.some((id) => !validIds.has(id));
  const savedPairs = [saved.matchupState.currentPair, saved.matchupState.previousPair];
  const invalidSameDatasetPair = !datasetChanged && (savedPairs.some((pair) => pair !== null && !validPair(pair, validIds)) || unknownQueueId);
  if (invalidSameDatasetPair) return { kind: "invalid", reason: "Saved matchup IDs do not match this player pool." };

  const savedById = new Map(saved.ratings.map((rating) => [rating.playerId, rating]));
  const ratings: Ratings = {};
  for (const player of fresh.eloPlayers) {
    const rating = savedById.get(player.id);
    ratings[player.id] = rating
      ? { playerId: player.id, elo: rating.rating, wins: rating.wins, losses: rating.losses, comparisons: rating.comparisons }
      : { playerId: player.id, elo: DEFAULT_INITIAL_RATING, wins: 0, losses: 0, comparisons: 0 };
  }
  const currentPair = validPair(saved.matchupState.currentPair, validIds) ? saved.matchupState.currentPair : null;
  const previousPair = validPair(saved.matchupState.previousPair, validIds) ? saved.matchupState.previousPair : null;
  const remainingQueue = saved.matchupState.remainingQueue.filter((id, index, queue) => validIds.has(id) && queue.indexOf(id) === index);
  const reconciled = datasetChanged || !currentPair || remainingQueue.length !== saved.matchupState.remainingQueue.length || saved.ratings.length !== fresh.eloPlayers.length;
  let session: BrowserSession = { ...fresh, ratings, completedComparisons: saved.completedComparisons, skippedMatchups: saved.skippedComparisons, queue: remainingQueue, queueIndex: 0, currentMatchup: currentPair ? asMatchup(currentPair) : null, previousMatchup: previousPair ? asMatchup(previousPair) : null };
  if (!session.currentMatchup) session = selectNextMatchup(session, random);
  return { kind: reconciled ? "reconciled" : "restored", session };
}
