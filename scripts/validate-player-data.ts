import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { PlayerDataset } from "../src/data/types.js";
import { validateDataset } from "../src/data/validation.js";

const file = join(process.cwd(), "public", "data", "players.json");
try {
  const dataset = JSON.parse(await readFile(file, "utf8")) as PlayerDataset;
  const errors = validateDataset(dataset);
  if (errors.length) throw new Error(errors.join("\n- "));
  const counts = <T>(values: T[], key: (value: T) => string) => values.reduce<Record<string, number>>((result, value) => { const label = key(value); result[label] = (result[label] ?? 0) + 1; return result; }, {});
  const byGroup = counts(dataset.players, (player) => player.positionGroup);
  const byTeam = counts(dataset.players, (player) => player.teamAbbreviation);
  const optionalMissing = dataset.players.reduce((count, player) => count + [player.position, player.age, player.baseSalary, player.guaranteedCompensation, player.previousSeason].filter((value) => value === undefined).length, 0);
  console.log(`Player dataset valid\n\nLabel: ${dataset.humanReadableLabel}\nSemantic version: ${dataset.dataVersion}\nGeneration time: ${dataset.generatedAt}\nVerified statistics-through: ${dataset.statisticsThrough ?? "not recorded"}\nSalary release: ${dataset.salary.selectedRelease ?? "unavailable"} ${dataset.salary.currency}\nRoster snapshot: ${dataset.rosterSnapshot.snapshotDate}\nTotal players: ${dataset.players.length}\nBy position: ${Object.entries(byGroup).map(([group, rows]) => `${group}=${rows}`).join(", ")}\nBy team: ${Object.entries(byTeam).map(([team, rows]) => `${team}=${rows}`).join(", ")}\nCurrent-season minutes: ${dataset.players.filter((player) => (player.currentSeason.minutes ?? 0) > 0).length}\nPrevious-season minutes: ${dataset.players.filter((player) => (player.previousSeason?.minutes ?? 0) > 0).length}\nSalary data: ${dataset.players.filter((player) => player.baseSalary !== undefined || player.guaranteedCompensation !== undefined).length}\nMissing optional fields: ${optionalMissing}`);
} catch (error) { console.error(`Dataset validation failed: ${(error as Error).message}`); process.exitCode = 1; }
