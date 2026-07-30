import type { PlayerSeasonStats } from "./types.js";

const ADDITIVE_FIELDS: Array<Exclude<keyof PlayerSeasonStats, "season">> =
  ["appearances", "starts", "minutes", "goals", "assists", "xGoals", "xAssists", "keyPasses", "goalsAdded"];

/** ASA requests use split_by_teams=true, so a player can legitimately have one
 * row per club.  These are component totals, hence additive. */
export function aggregateSeasonStats(season: number, rows: Partial<PlayerSeasonStats>[]): PlayerSeasonStats {
  const output: PlayerSeasonStats = { season };
  for (const field of ADDITIVE_FIELDS) {
    const values = rows.map((row) => row[field]).filter((value): value is number => typeof value === "number");
    if (values.length) output[field] = values.reduce((sum, value) => sum + value, 0) as never;
  }
  return output;
}

export function stablePlayerSort<T extends { name: string; id: string }>(players: T[]): T[] {
  return [...players].sort((a, b) => a.name.localeCompare(b.name, "en") || a.id.localeCompare(b.id, "en"));
}
