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

function assertPlayer(value: unknown, index: number): asserts value is ComparisonPoolPlayer {
  if (!value || typeof value !== "object") {
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
    typeof player.currentSeason.season !== "number"
  ) {
    throw new PoolDataError(`Player ${index + 1} is missing a required field.`, "invalid");
  }
}

export function validateBrowserPool(value: unknown): ComparisonPool {
  if (!value || typeof value !== "object") {
    throw new PoolDataError("The comparison pool is not an object.", "invalid");
  }
  const pool = value as Partial<ComparisonPool>;
  if (
    pool.schemaVersion !== 1 ||
    !isNonEmptyString(pool.dataVersion) ||
    !Number.isInteger(pool.season) ||
    !Number.isInteger(pool.previousSeason) ||
    !Array.isArray(pool.players)
  ) {
    throw new PoolDataError("The comparison pool metadata is invalid.", "invalid");
  }
  if (pool.players.length === 0) {
    throw new PoolDataError("The comparison pool is empty.", "empty");
  }
  if (pool.players.length < 2) {
    throw new PoolDataError("At least two eligible players are required.", "too-small");
  }

  const ids = new Set<string>();
  pool.players.forEach((player, index) => {
    assertPlayer(player, index);
    if (ids.has(player.id)) {
      throw new PoolDataError(`Duplicate ASA player ID: ${player.id}`, "invalid");
    }
    ids.add(player.id);
  });
  return pool as ComparisonPool;
}

export async function loadComparisonPool(
  fetcher: typeof fetch = fetch,
  baseUrl = import.meta.env.BASE_URL,
): Promise<ComparisonPool> {
  const response = await fetcher(`${baseUrl}${COMPARISON_POOL_URL}`);
  if (!response.ok) {
    throw new Error(`Comparison pool request failed with HTTP ${response.status}.`);
  }
  return validateBrowserPool(await response.json());
}
