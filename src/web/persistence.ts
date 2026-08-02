import type { ComparisonPool } from "../data/comparisonPool.js";
import { DEFAULT_INITIAL_RATING } from "../domain/elo.js";
import type { Ratings } from "../domain/types.js";
import { SCHEDULER_CONFIG } from "./scheduler/config.js";
import { sanitizeRecentPairs, sanitizeRecentPlayers } from "./scheduler/history.js";
import { createPairKey } from "./scheduler/pair.js";
import {
  initializeBrowserSession,
  selectNextMatchup,
  type BrowserSession,
  type Matchup,
  type RandomSource,
} from "./session.js";

export const PERSISTED_RANKING_SCHEMA_VERSION = 2 as const;
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
    previousPair: [string, string] | null;
    recentPairs: string[];
    recentPlayers: string[];
  };
  /** In-memory migration flags are intentionally omitted by serialization. */
  migratedFromSchemaVersion?: 1;
  schedulerStateRebuilt?: boolean;
}

export type PersistedValidationResult =
  | { kind: "valid"; state: PersistedRankingState }
  | { kind: "invalid"; reason: string };

export type RestoreResult =
  | { kind: "restored"; session: BrowserSession }
  | { kind: "reconciled"; session: BrowserSession; reason: "dataset" | "migration" | "scheduler-repair" }
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

function parsePair(value: unknown): [string, string] | null | undefined {
  if (value === null) return null;
  if (!Array.isArray(value) || value.length !== 2 || !value.every(isNonEmptyString)) return undefined;
  if (value[0] === value[1]) return undefined;
  return [value[0], value[1]];
}

function parseRatings(value: unknown, completedComparisons: number): PersistedRating[] | null {
  if (!Array.isArray(value)) return null;
  const ids = new Set<string>();
  const ratings: PersistedRating[] = [];
  for (const candidate of value) {
    if (!isRecord(candidate) || !isNonEmptyString(candidate.playerId) || ids.has(candidate.playerId) ||
      typeof candidate.rating !== "number" || !Number.isFinite(candidate.rating) || candidate.rating < MIN_ELO || candidate.rating > MAX_ELO ||
      !isCount(candidate.wins) || !isCount(candidate.losses) || !isCount(candidate.comparisons) ||
      candidate.comparisons !== candidate.wins + candidate.losses) {
      return null;
    }
    ids.add(candidate.playerId);
    ratings.push({
      playerId: candidate.playerId,
      rating: candidate.rating,
      wins: candidate.wins,
      losses: candidate.losses,
      comparisons: candidate.comparisons,
    });
  }
  // Dataset reconciliation can remove one side of old comparisons, so retained
  // record totals may be lower than the lifetime completed count but never higher.
  if (ratings.reduce((total, rating) => total + rating.wins, 0) > completedComparisons ||
      ratings.reduce((total, rating) => total + rating.losses, 0) > completedComparisons ||
      ratings.reduce((total, rating) => total + rating.comparisons, 0) > completedComparisons * 2) {
    return null;
  }
  return ratings;
}

function parseCommon(value: Record<string, unknown>): {
  datasetVersion: string;
  savedAt: string;
  ratings: PersistedRating[];
  completedComparisons: number;
  skippedComparisons: number;
  matchupState: Record<string, unknown>;
} | null {
  if (!isNonEmptyString(value.datasetVersion) || !isIsoTimestamp(value.savedAt) ||
      !isCount(value.completedComparisons) || !isCount(value.skippedComparisons) || !isRecord(value.matchupState)) {
    return null;
  }
  const ratings = parseRatings(value.ratings, value.completedComparisons);
  if (!ratings) return null;
  return {
    datasetVersion: value.datasetVersion,
    savedAt: value.savedAt,
    ratings,
    completedComparisons: value.completedComparisons,
    skippedComparisons: value.skippedComparisons,
    matchupState: value.matchupState,
  };
}

function uniqueLatest(values: readonly string[]): string[] {
  const result: string[] = [];
  for (const value of values) {
    const prior = result.indexOf(value);
    if (prior >= 0) result.splice(prior, 1);
    result.push(value);
  }
  return result;
}

function migrateVersion1(common: NonNullable<ReturnType<typeof parseCommon>>): PersistedRankingState | null {
  const currentPair = parsePair(common.matchupState.currentPair);
  const previousPair = parsePair(common.matchupState.previousPair);
  if (currentPair === undefined || previousPair === undefined ||
      !Array.isArray(common.matchupState.remainingQueue) || !common.matchupState.remainingQueue.every(isNonEmptyString)) {
    return null;
  }
  return {
    schemaVersion: PERSISTED_RANKING_SCHEMA_VERSION,
    datasetVersion: common.datasetVersion,
    savedAt: common.savedAt,
    ratings: common.ratings,
    completedComparisons: common.completedComparisons,
    skippedComparisons: common.skippedComparisons,
    matchupState: {
      currentPair,
      previousPair,
      recentPairs: previousPair ? [createPairKey(previousPair[0], previousPair[1])] : [],
      recentPlayers: previousPair ? [...previousPair] : [],
    },
    migratedFromSchemaVersion: 1,
  };
}

/** Parses all untrusted localStorage content and explicitly migrates version 1. */
export function validatePersistedRankingState(value: unknown): PersistedValidationResult {
  if (!isRecord(value)) return { kind: "invalid", reason: "Saved value is not an object." };
  if (value.schemaVersion !== 1 && value.schemaVersion !== PERSISTED_RANKING_SCHEMA_VERSION) {
    return { kind: "invalid", reason: "Unsupported schema version." };
  }
  const common = parseCommon(value);
  if (!common) return { kind: "invalid", reason: "Saved ranking has malformed fields." };
  if (value.schemaVersion === 1) {
    const migrated = migrateVersion1(common);
    return migrated ? { kind: "valid", state: migrated } : { kind: "invalid", reason: "Saved matchup state is invalid." };
  }
  const currentPair = parsePair(common.matchupState.currentPair);
  const previousPair = parsePair(common.matchupState.previousPair);
  if (currentPair === undefined || previousPair === undefined ||
      !Array.isArray(common.matchupState.recentPairs) || !common.matchupState.recentPairs.every(isNonEmptyString) ||
      !Array.isArray(common.matchupState.recentPlayers) || !common.matchupState.recentPlayers.every(isNonEmptyString)) {
    return { kind: "invalid", reason: "Saved matchup state is invalid." };
  }
  const recentPairs = uniqueLatest(common.matchupState.recentPairs).slice(-SCHEDULER_CONFIG.recentPairLimit);
  const recentPlayers = common.matchupState.recentPlayers.slice(-SCHEDULER_CONFIG.recentPlayerLimit);
  const schedulerStateRebuilt = recentPairs.length !== common.matchupState.recentPairs.length ||
    recentPlayers.length !== common.matchupState.recentPlayers.length;
  return {
    kind: "valid",
    state: {
      schemaVersion: PERSISTED_RANKING_SCHEMA_VERSION,
      datasetVersion: common.datasetVersion,
      savedAt: common.savedAt,
      ratings: common.ratings,
      completedComparisons: common.completedComparisons,
      skippedComparisons: common.skippedComparisons,
      matchupState: { currentPair, previousPair, recentPairs, recentPlayers },
      schedulerStateRebuilt: schedulerStateRebuilt || undefined,
    },
  };
}

export function deserializePersistedRankingState(raw: string): PersistedValidationResult {
  try {
    return validatePersistedRankingState(JSON.parse(raw));
  } catch {
    return { kind: "invalid", reason: "Saved value is not valid JSON." };
  }
}

export function createPersistedRankingState(
  session: BrowserSession,
  datasetVersion: string,
  savedAt = new Date().toISOString(),
): PersistedRankingState {
  return {
    schemaVersion: PERSISTED_RANKING_SCHEMA_VERSION,
    datasetVersion,
    savedAt,
    ratings: Object.values(session.ratings)
      .map((rating) => ({
        playerId: rating.playerId,
        rating: rating.elo,
        wins: rating.wins,
        losses: rating.losses,
        comparisons: rating.comparisons,
      }))
      .sort((a, b) => a.playerId.localeCompare(b.playerId)),
    completedComparisons: session.completedComparisons,
    skippedComparisons: session.skippedMatchups,
    matchupState: {
      currentPair: session.currentMatchup
        ? [session.currentMatchup.playerAId, session.currentMatchup.playerBId]
        : null,
      previousPair: session.previousMatchup
        ? [session.previousMatchup.playerAId, session.previousMatchup.playerBId]
        : null,
      recentPairs: session.recentPairs.slice(-SCHEDULER_CONFIG.recentPairLimit),
      recentPlayers: session.recentPlayers.slice(-SCHEDULER_CONFIG.recentPlayerLimit),
    },
  };
}

export function serializePersistedRankingState(
  session: BrowserSession,
  datasetVersion: string,
  savedAt?: string,
): string {
  return JSON.stringify(createPersistedRankingState(session, datasetVersion, savedAt));
}

function asMatchup(pair: [string, string] | null): Matchup | null {
  return pair ? { playerAId: pair[0], playerBId: pair[1] } : null;
}

function validPair(pair: [string, string] | null, ids: ReadonlySet<string>): pair is [string, string] {
  return Boolean(pair) && pair![0] !== pair![1] && ids.has(pair![0]) && ids.has(pair![1]);
}

/** Restores normalized records directly; it deliberately never replays votes. */
export function restoreBrowserSession(
  pool: ComparisonPool,
  saved: PersistedRankingState,
  random: RandomSource = Math.random,
): RestoreResult {
  const fresh = initializeBrowserSession(pool.players, random);
  const validIds = new Set(fresh.eloPlayers.map((player) => player.id));
  const savedById = new Map(saved.ratings.map((rating) => [rating.playerId, rating]));
  const ratings: Ratings = {};
  for (const player of fresh.eloPlayers) {
    const rating = savedById.get(player.id);
    ratings[player.id] = rating
      ? { playerId: player.id, elo: rating.rating, wins: rating.wins, losses: rating.losses, comparisons: rating.comparisons }
      : { playerId: player.id, elo: DEFAULT_INITIAL_RATING, wins: 0, losses: 0, comparisons: 0 };
  }
  const previousPair = validPair(saved.matchupState.previousPair, validIds) ? saved.matchupState.previousPair : null;
  const sanitizedPairs = sanitizeRecentPairs(saved.matchupState.recentPairs, validIds);
  const sanitizedPlayers = sanitizeRecentPlayers(saved.matchupState.recentPlayers, validIds);
  const candidateCurrent = validPair(saved.matchupState.currentPair, validIds) ? saved.matchupState.currentPair : null;
  const onlyOnePossiblePair = validIds.size === 2;
  const repeatsPrevious = candidateCurrent && previousPair &&
    createPairKey(candidateCurrent[0], candidateCurrent[1]) === createPairKey(previousPair[0], previousPair[1]);
  const currentPair = repeatsPrevious && !onlyOnePossiblePair ? null : candidateCurrent;
  const currentKey = currentPair ? createPairKey(currentPair[0], currentPair[1]) : null;
  const recentPairs = sanitizedPairs.filter((key) => key !== currentKey);
  const datasetChanged = saved.datasetVersion !== pool.dataVersion;
  const reconciled = datasetChanged || Boolean(saved.migratedFromSchemaVersion) || Boolean(saved.schedulerStateRebuilt) ||
    saved.ratings.length !== fresh.eloPlayers.length ||
    !currentPair ||
    (saved.matchupState.previousPair !== null && !previousPair) ||
    recentPairs.length !== saved.matchupState.recentPairs.length ||
    sanitizedPlayers.length !== saved.matchupState.recentPlayers.length;
  let session: BrowserSession = {
    ...fresh,
    ratings,
    completedComparisons: saved.completedComparisons,
    skippedMatchups: saved.skippedComparisons,
    currentMatchup: currentPair ? asMatchup(currentPair) : null,
    previousMatchup: previousPair ? asMatchup(previousPair) : null,
    recentPairs,
    recentPlayers: sanitizedPlayers,
  };
  if (!session.currentMatchup) session = selectNextMatchup(session, random);
  if (!reconciled) return { kind: "restored", session };
  return {
    kind: "reconciled",
    session,
    reason: datasetChanged
      ? "dataset"
      : saved.migratedFromSchemaVersion
        ? "migration"
        : "scheduler-repair",
  };
}
