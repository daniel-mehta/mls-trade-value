import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { aggregateSeasonStats, stablePlayerSort } from "../src/data/aggregation.js";
import { fetchAsa, numberField, textField, type AsaDatasetName, type AsaRow } from "../src/data/asaClient.js";
import { isEligible } from "../src/data/eligibility.js";
import { normalizePosition } from "../src/data/position.js";
import { latestSalaryByPlayer } from "../src/data/salary.js";
import { COMPETITION, CURRENT_SEASON, PREVIOUS_SEASON, type PlayerDataset, type PlayerSeasonStats, type StaticPlayer } from "../src/data/types.js";
import { assertValidDataset } from "../src/data/validation.js";

const forceRefresh = process.argv.includes("--refresh");
const ID = (row: AsaRow) => textField(row, "player_id", "playerId");
const TEAM_ID = (row: AsaRow) => textField(row, "team_id", "teamId");
const NAME = (row: AsaRow) => textField(row, "player_name", "playerName", "name");

interface Team { id: string; name: string; abbreviation: string; }
interface PlayerInfo { name?: string; position?: string; age?: number; }

/** Convert only observed ASA aliases. The probe exposes any future field rename;
 * no guessed metrics are emitted. Stats are player-team-season component totals. */
function statsFromRows(season: number, xg: AsaRow[], xpass: AsaRow[], gplus: AsaRow[]): Map<string, PlayerSeasonStats> {
  const collect = (rows: AsaRow[], convert: (row: AsaRow) => Partial<PlayerSeasonStats>) => {
    const groups = new Map<string, Partial<PlayerSeasonStats>[]>();
    for (const row of rows) { const id = ID(row); if (id) (groups.get(id) ?? groups.set(id, []).get(id)!).push(convert(row)); }
    return new Map([...groups].map(([id, values]) => [id, aggregateSeasonStats(season, values)]));
  };
  const xgStats = collect(xg, (row) => ({
    appearances: numberField(row, "appearances", "games_played"), starts: numberField(row, "starts"), minutes: numberField(row, "minutes_played", "minutes"),
    goals: numberField(row, "goals"), assists: numberField(row, "primary_assists", "assists"), xGoals: numberField(row, "xgoals", "x_goals"),
    xAssists: numberField(row, "xassists", "x_assists"), keyPasses: numberField(row, "key_passes"),
  }));
  // xPass can supply creative values omitted by xGoals; only add fields not
  // already represented in xGoals to avoid double-counting the same minutes.
  const passStats = collect(xpass, (row) => ({ xAssists: numberField(row, "xassists", "x_assists"), keyPasses: numberField(row, "key_passes") }));
  const gplusStats = collect(gplus, (row) => {
    // Goals Added returns one nested component per action type, not a pre-summed
    // player value. Sum raw g+ exactly once for this player-team-season row.
    const components = Array.isArray(row.data) ? row.data as AsaRow[] : [];
    const goalsAdded = components.reduce((sum, component) => sum + (numberField(component, "goals_added_raw") ?? 0), 0);
    return { goalsAdded: components.length ? goalsAdded : undefined };
  });
  const ids = new Set([...xgStats.keys(), ...passStats.keys(), ...gplusStats.keys()]);
  return new Map([...ids].map((id) => {
    const shooting = xgStats.get(id) ?? { season };
    const passing = passStats.get(id);
    const added = gplusStats.get(id);
    return [id, { ...shooting, xAssists: shooting.xAssists ?? passing?.xAssists, keyPasses: shooting.keyPasses ?? passing?.keyPasses, goalsAdded: added?.goalsAdded }];
  }));
}

function displayedRows(rows: AsaRow[]): Map<string, AsaRow> {
  const output = new Map<string, AsaRow>();
  for (const row of rows) {
    const id = ID(row); if (!id) continue;
    const existing = output.get(id);
    // ASA does not expose a transfer timestamp. Where a player has multiple
    // current-season teams, use the club with the most recorded minutes rather
    // than an arbitrary response order; the report still flags those players.
    if (!existing || (numberField(row, "minutes_played", "minutes") ?? 0) > (numberField(existing, "minutes_played", "minutes") ?? 0)) output.set(id, row);
  }
  return output;
}

async function loadSeason(name: AsaDatasetName, season: number): Promise<AsaRow[]> {
  const response = await fetchAsa(name, season, forceRefresh);
  console.log(`${name} ${season}: ${response.rows.length} rows from ${response.fromCache ? "cache" : "API"}`);
  return response.rows;
}

async function main(): Promise<void> {
  const [playersResult, teamsResult] = await Promise.all([fetchAsa("players", undefined, forceRefresh), fetchAsa("teams", undefined, forceRefresh)]);
  const teams = new Map<string, Team>();
  for (const row of teamsResult.rows) {
    const id = TEAM_ID(row) ?? textField(row, "team_id", "id");
    const name = textField(row, "team_name", "name");
    const abbreviation = textField(row, "team_abbreviation", "abbreviation", "team_short_name", "short_name");
    if (id && name && abbreviation) teams.set(id, { id, name, abbreviation });
  }
  const playerInfo = new Map<string, PlayerInfo>();
  for (const row of playersResult.rows) { const id = ID(row); if (id) playerInfo.set(id, { name: NAME(row), position: textField(row, "general_position", "position"), age: numberField(row, "age") }); }

  const loadMetrics = async (season: number) => {
    const [xg, xpass, gplus] = await Promise.all([loadSeason("xgoals", season), loadSeason("xpass", season), loadSeason("goals-added", season)]);
    let salaries: AsaRow[] = [];
    try { salaries = await loadSeason("salaries", season); } catch (error) { console.warn(`Salary data unavailable for ${season}: ${(error as Error).message}`); }
    return { xg, xpass, gplus, salaries };
  };
  const [current, previous] = await Promise.all([loadMetrics(CURRENT_SEASON), loadMetrics(PREVIOUS_SEASON)]);
  const currentStats = statsFromRows(CURRENT_SEASON, current.xg, current.xpass, current.gplus);
  const previousStats = statsFromRows(PREVIOUS_SEASON, previous.xg, previous.xpass, previous.gplus);
  const allCurrentRows = [...current.xg, ...current.xpass, ...current.gplus];
  const allPreviousRows = [...previous.xg, ...previous.xpass, ...previous.gplus];
  const currentByPlayer = displayedRows(allCurrentRows); const previousByPlayer = displayedRows(allPreviousRows);
  // Do not sum salary releases. Prefer the latest dated MLSPA publication and
  // fail closed if that still leaves conflicting records for a player.
  const salaryByPlayer = latestSalaryByPlayer(current.salaries.length ? current.salaries : previous.salaries);
  const ids = new Set([...currentStats.keys(), ...previousStats.keys()]);
  const unknownPositions = new Set<string>(); const multiTeam = new Set<string>(); let unmatchedSalaryRows = 0;
  const players: StaticPlayer[] = [];
  for (const id of ids) {
    const currentRow = currentByPlayer.get(id); const previousRow = previousByPlayer.get(id);
    const sourceRow = currentRow ?? previousRow;
    if (!sourceRow) continue;
    const info = playerInfo.get(id); const position = textField(sourceRow, "general_position", "position") ?? info?.position;
    const positionGroup = normalizePosition(position);
    if (!positionGroup) { if (position) unknownPositions.add(position); continue; }
    const rowTeams = new Set(allCurrentRows.filter((row) => ID(row) === id).map(TEAM_ID).filter(Boolean)); if (rowTeams.size > 1) multiTeam.add(id);
    // The player endpoint has no current-team field. For a multi-team current
    // season, displayedRows chooses most minutes; recent transfers can therefore
    // retain a former club until a future roster/manual-override phase.
    // An ASA team ID is required so no name-based team join can silently drift.
    const teamId = TEAM_ID(sourceRow); const team = teamId ? teams.get(teamId) : undefined;
    if (!team) continue;
    const salary = salaryByPlayer.get(id);
    const player: StaticPlayer = {
      id, name: NAME(sourceRow) ?? info?.name ?? "", teamId: team.id, teamName: team.name, teamAbbreviation: team.abbreviation,
      positionGroup, ...(position ? { position } : {}), ...(info?.age !== undefined ? { age: info.age } : {}),
      ...(salary && numberField(salary, "base_salary", "baseSalary") !== undefined ? { baseSalary: numberField(salary, "base_salary", "baseSalary") } : {}),
      ...(salary && numberField(salary, "guaranteed_compensation", "guaranteedCompensation") !== undefined ? { guaranteedCompensation: numberField(salary, "guaranteed_compensation", "guaranteedCompensation") } : {}),
      currentSeason: currentStats.get(id) ?? { season: CURRENT_SEASON }, ...(previousStats.has(id) ? { previousSeason: previousStats.get(id) } : {}),
    };
    if (isEligible(player)) players.push(player);
  }
  for (const salaryId of salaryByPlayer.keys()) if (!ids.has(salaryId)) unmatchedSalaryRows++;
  if (unknownPositions.size) console.warn(`Unrecognized ASA positions excluded: ${[...unknownPositions].join(", ")}`);
  const dataset: PlayerDataset = { schemaVersion: 1, dataVersion: `asa-mls-${CURRENT_SEASON}-${PREVIOUS_SEASON}`, competition: "MLS", season: CURRENT_SEASON, previousSeason: PREVIOUS_SEASON, generatedAt: new Date().toISOString(), sources: [{ name: "American Soccer Analysis API", url: "https://app.americansocceranalysis.com/api/v1/__docs__/" }], players: stablePlayerSort(players) };
  assertValidDataset(dataset);
  await mkdir(join(process.cwd(), "public", "data"), { recursive: true });
  await writeFile(join(process.cwd(), "public", "data", "players.json"), `${JSON.stringify(dataset, null, 2)}\n`);
  console.log(`\nMLS player dataset generated\n\nCurrent season: ${CURRENT_SEASON}\nPrevious season: ${PREVIOUS_SEASON}\nPlayers written: ${players.length}\nTeams represented: ${new Set(players.map((player) => player.teamId)).size}\nPlayers with salary data: ${players.filter((player) => player.baseSalary !== undefined || player.guaranteedCompensation !== undefined).length}\nPlayers with current-season minutes: ${players.filter((player) => (player.currentSeason.minutes ?? 0) > 0).length}\nMulti-team players: ${multiTeam.size}\nUnmatched salary rows: ${unmatchedSalaryRows}\n\nOutput: public/data/players.json`);
}

main().catch((error) => { console.error(`Dataset build failed: ${(error as Error).message}`); process.exitCode = 1; });
