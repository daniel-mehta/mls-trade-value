import type { PlayerDataset, PositionGroup, StaticPlayer } from "./types.js";
import { stablePlayerSort } from "./aggregation.js";

const GROUPS: PositionGroup[] = ["GK", "DEF", "MID", "FWD"];
const NON_NEGATIVE_FIELDS = ["appearances", "starts", "minutes", "goals", "assists", "xGoals", "xAssists", "keyPasses"] as const;

export function validateDataset(dataset: PlayerDataset): string[] {
  const errors: string[] = [];
  if (dataset.schemaVersion !== 1 && dataset.schemaVersion !== 2) errors.push("schemaVersion must be 1 or 2");
  if (dataset.rosterSnapshot && (!/^\d{4}-\d{2}-\d{2}$/.test(dataset.rosterSnapshot.releaseDate) || dataset.rosterSnapshot.isLive !== false)) errors.push("invalid or live roster snapshot");
  if (!Number.isInteger(dataset.season) || dataset.season < 1996) errors.push("invalid dataset season");
  if (!Array.isArray(dataset.players) || !dataset.players.length) errors.push("players must be non-empty");
  const ids = new Set<string>();
  for (const player of dataset.players ?? []) validatePlayer(player, ids, errors);
  const sorted = stablePlayerSort(dataset.players ?? []);
  if (sorted.some((player, index) => player.id !== dataset.players[index]?.id)) errors.push("players are not deterministically sorted");
  return errors;
}

function validatePlayer(player: StaticPlayer, ids: Set<string>, errors: string[]): void {
  if (!player.id || ids.has(player.id)) errors.push(`duplicate or empty player ID: ${player.id}`); ids.add(player.id);
  for (const field of ["name", "teamId", "teamName", "teamAbbreviation"] as const) if (!player[field]) errors.push(`${player.id}: missing ${field}`);
  if (!GROUPS.includes(player.positionGroup)) errors.push(`${player.id}: invalid position group`);
  for (const stats of [player.currentSeason, player.previousSeason]) {
    if (!stats) continue;
    if (!Number.isInteger(stats.season)) errors.push(`${player.id}: invalid season`);
    for (const field of NON_NEGATIVE_FIELDS) if (stats[field] !== undefined && (!Number.isFinite(stats[field]) || stats[field] < 0)) errors.push(`${player.id}: invalid ${field}`);
    // ASA Goals Added is a signed contribution metric, unlike xG and minutes.
    if (stats.goalsAdded !== undefined && !Number.isFinite(stats.goalsAdded)) errors.push(`${player.id}: invalid goalsAdded`);
  }
  for (const field of ["baseSalary", "guaranteedCompensation"] as const) if (player[field] !== undefined && (!Number.isFinite(player[field]) || player[field] < 0)) errors.push(`${player.id}: invalid ${field}`);
  if (JSON.stringify(player).includes("null")) errors.push(`${player.id}: null is not allowed; omit optional fields`);
  const roster = player.rosterProfile;
  if (roster) {
    if (!roster.listedInRosterSnapshot || !roster.snapshotTeamId || !roster.snapshotTeamName || !/^\d{4}-\d{2}-\d{2}$/.test(roster.snapshotDate)) errors.push(`${player.id}: invalid roster profile`);
    if (roster.optionYears && (new Set(roster.optionYears).size !== roster.optionYears.length || roster.optionYears.some((year) => !/^\d{4}$/.test(year)))) errors.push(`${player.id}: invalid option years`);
  }
}

export function assertValidDataset(dataset: PlayerDataset): void { const errors = validateDataset(dataset); if (errors.length) throw new Error(`Dataset validation failed:\n- ${errors.join("\n- ")}`); }
