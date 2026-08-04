import type { PlayerSeasonStats } from "./types.js";

const ADDITIVE_FIELDS: Array<Exclude<keyof PlayerSeasonStats, "season">> =
  ["appearances", "starts", "minutes", "goals", "assists", "xGoals", "xAssists", "keyPasses", "goalsAdded"];

/** ASA requests use split_by_teams=true, so a player can legitimately have one
 * row per club.  These are component totals, hence additive. */
export function aggregateSeasonStats(season: number, rows: Partial<PlayerSeasonStats>[]): PlayerSeasonStats {
  const output: PlayerSeasonStats = { season };
  for (const field of ADDITIVE_FIELDS) {
    const values = rows.map((row) => row[field]).filter((value): value is number => typeof value === "number");
    if (values.length) output[field] = values.sort((a, b) => a - b).reduce((sum, value) => sum + value, 0) as never;
  }
  return output;
}

export function stablePlayerSort<T extends { name: string; id: string }>(players: T[]): T[] {
  const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
  return [...players].sort((a, b) => compare(a.name, b.name) || compare(a.id, b.id));
}

export interface TeamSeasonMinutes {
  teamId: string;
  currentSeasonMinutes: number;
  previousSeasonMinutes: number;
}

/** The final team ID makes equal-minute transfer cases independent of source order. */
export function selectDisplayedTeam(candidates: readonly TeamSeasonMinutes[]): TeamSeasonMinutes | undefined {
  return [...candidates].sort((a, b) =>
    b.currentSeasonMinutes - a.currentSeasonMinutes ||
    b.previousSeasonMinutes - a.previousSeasonMinutes ||
    (a.teamId < b.teamId ? -1 : a.teamId > b.teamId ? 1 : 0)
  )[0];
}
