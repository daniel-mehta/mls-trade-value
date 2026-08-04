import { fetchAsa, field, textField, type AsaDatasetName } from "../src/data/asaClient.js";
import { CURRENT_SEASON, PREVIOUS_SEASON } from "../src/data/types.js";

const forceRefresh = process.argv.includes("--refresh");
const datasets: AsaDatasetName[] = [
  "players",
  "teams",
  "xgoals",
  "xpass",
  "goals-added",
  "salaries",
  "goalkeeper-xgoals",
  "goalkeeper-goals-added",
];

function playerId(row: Record<string, unknown>): string | undefined { return textField(row, "player_id", "playerId", "id"); }
function teamId(row: Record<string, unknown>): string | undefined { return textField(row, "team_id", "teamId"); }

/** This is deliberately a read-only development diagnostic. It establishes
 * response shape and expected ID join keys before the generator uses a field. */
for (const season of [CURRENT_SEASON, PREVIOUS_SEASON]) {
  console.log(`\nASA MLS probe — requested season ${season}`);
  for (const name of datasets) {
    try {
      const result = await fetchAsa(name, name === "players" || name === "teams" ? undefined : season, forceRefresh);
      const ids = result.rows.map(playerId);
      const teamIds = result.rows.map(teamId);
      const duplicateIds = ids.filter((id, index) => id && ids.indexOf(id) !== index).length;
      const positions = [...new Set(result.rows.map((row) => field(row, "general_position", "position")).filter((value) => typeof value === "string"))].sort();
      console.log(`\n${name} (${result.fromCache ? "cache" : "API"})`);
      console.log(`  endpoint: ${result.url}\n  rows: ${result.rows.length}\n  fields: ${[...new Set(result.rows.flatMap(Object.keys))].sort().join(", ") || "none"}`);
      console.log(`  missing player IDs: ${ids.filter((id) => !id).length}; missing team IDs: ${teamIds.filter((id) => !id).length}; duplicate player IDs: ${duplicateIds}`);
      console.log(`  positions: ${positions.join(", ") || "none"}\n  sample: ${JSON.stringify(result.rows.slice(0, 2), null, 2)}`);
      if (name === "salaries") console.log(`  salary data exists: ${result.rows.length > 0}`);
    } catch (error) { console.log(`\n${name}\n  REQUEST FAILED: ${(error as Error).message}`); }
  }
}
