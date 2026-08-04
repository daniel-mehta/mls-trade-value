import type { ComparisonPool, ComparisonPoolPlayer } from "../data/comparisonPool.js";

export const COMPARISON_POOL_URL = "data/comparison-pool.json";

export class PoolDataError extends Error {
  constructor(
    message: string,
    public readonly reason: "invalid" | "empty" | "too-small",
  ) {
    super(message);
    this.name = "PoolDataError";
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString() === value;
}

function isDateOrNull(value: unknown): boolean {
  if (value === null) return true;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function isVersion(value: unknown): value is string {
  return typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function assertPlayer(value: unknown, index: number): asserts value is ComparisonPoolPlayer {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PoolDataError(`Player ${index + 1} is not an object.`, "invalid");
  }
  const player = value as Partial<ComparisonPoolPlayer>;
  if (
    !isNonEmptyString(player.id) ||
    !isNonEmptyString(player.name) ||
    !isNonEmptyString(player.teamId) ||
    !isNonEmptyString(player.teamName) ||
    !isNonEmptyString(player.teamAbbreviation) ||
    !["GK", "DEF", "MID", "FWD"].includes(player.positionGroup ?? "") ||
    !player.currentSeason ||
    !Number.isInteger(player.currentSeason.season) ||
    !Array.isArray(player.selectionReasons) ||
    player.selectionReasons.length === 0
  ) {
    throw new PoolDataError(`Player ${index + 1} is missing a required field.`, "invalid");
  }
}

export function validateBrowserPool(value: unknown): ComparisonPool {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PoolDataError("The comparison pool is not an object.", "invalid");
  }
  const pool = value as Partial<ComparisonPool>;
  if (!exactKeys(value as Record<string, unknown>, ["schemaVersion", "humanReadableLabel", "dataVersion", "sourceDataVersion", "season", "previousSeason", "generatedAt", "provenance", "selectionRules", "overrides", "audit", "players"]) ||
    pool.schemaVersion !== 2 ||
    !isNonEmptyString(pool.humanReadableLabel) ||
    !isVersion(pool.dataVersion) ||
    !isVersion(pool.sourceDataVersion) ||
    !Number.isInteger(pool.season) ||
    !Number.isInteger(pool.previousSeason) ||
    !isIsoTimestamp(pool.generatedAt) ||
    !Array.isArray(pool.players)
  ) {
    throw new PoolDataError("The comparison pool metadata is invalid.", "invalid");
  }
  const provenance = pool.provenance;
  if (!provenance ||
    provenance.sourcePlayerDataVersion !== pool.sourceDataVersion ||
    !isIsoTimestamp(provenance.sourcePlayerGeneratedAt) ||
    !isDateOrNull(provenance.statisticsThrough) ||
    !isDateOrNull(provenance.rosterSnapshotDate) || provenance.rosterSnapshotDate === null ||
    !isDateOrNull(provenance.rosterReleaseDate) || provenance.rosterReleaseDate === null ||
    !isDateOrNull(provenance.salaryReleaseDate) ||
    provenance.salaryCurrency !== "USD"
  ) {
    throw new PoolDataError("The comparison pool provenance is invalid.", "invalid");
  }
  if (!pool.selectionRules || !pool.overrides || !pool.audit) {
    throw new PoolDataError("The comparison pool audit metadata is missing.", "invalid");
  }
  if (pool.players.length === 0) throw new PoolDataError("The comparison pool is empty.", "empty");
  if (pool.players.length < 2) throw new PoolDataError("At least two eligible players are required.", "too-small");

  const ids = new Set<string>();
  pool.players.forEach((player, index) => {
    assertPlayer(player, index);
    if (ids.has(player.id)) throw new PoolDataError(`Duplicate ASA player ID: ${player.id}`, "invalid");
    ids.add(player.id);
  });
  if (pool.audit.finalPoolSize !== pool.players.length) throw new PoolDataError("The pool audit count is inconsistent.", "invalid");
  return pool as ComparisonPool;
}

export async function loadComparisonPool(
  fetcher: typeof fetch = fetch,
  baseUrl = import.meta.env.BASE_URL,
): Promise<ComparisonPool> {
  const response = await fetcher(`${baseUrl}${COMPARISON_POOL_URL}`);
  if (!response.ok) throw new Error(`Comparison pool request failed with HTTP ${response.status}.`);
  return validateBrowserPool(await response.json());
}
