import { numberField, textField, type AsaRow } from "./asaClient.js";
import { canonicalStringify } from "./semanticVersion.js";
import {
  GOALKEEPER_GOALS_ADDED_ACTIONS,
  type GoalkeeperGoalsAddedAction,
  type GoalkeeperSeasonMetrics,
  type GoalkeeperSourceAudit,
  type StaticPlayer,
} from "./types.js";

const SOURCE_ACTIONS: Record<string, GoalkeeperGoalsAddedAction> = {
  Claiming: "claiming",
  Fielding: "fielding",
  Handling: "handling",
  Passing: "passing",
  Shotstopping: "shotstopping",
  Sweeping: "sweeping",
};

const XGOALS_FIELDS = [
  "shotsFaced",
  "goalsConceded",
  "saves",
  "xGoalsFaced",
  "goalsMinusXGoalsFaced",
] as const;

interface NormalizedSourceRows {
  playerIds: Set<string>;
  duplicateRows: number;
  rawRowCount: number;
}

export interface GoalkeeperSeasonNormalization {
  season: number;
  metricsByPlayer: Map<string, GoalkeeperSeasonMetrics>;
  xGoals: NormalizedSourceRows;
  goalsAdded: NormalizedSourceRows;
}

function requiredText(row: AsaRow, field: string, label: string): string {
  const value = textField(row, field);
  if (!value) throw new Error(`${label}: missing ${field}`);
  return value;
}

function numeric(row: AsaRow, field: string, label: string, nonNegative: boolean): number | undefined {
  if (row[field] === undefined || row[field] === null) return undefined;
  const value = numberField(row, field);
  if (value === undefined || (nonNegative && value < 0)) throw new Error(`${label}: invalid ${field}`);
  return value;
}

function rowIdentity(row: AsaRow, season: number, label: string): { playerId: string; teamId: string } {
  const playerId = requiredText(row, "player_id", label);
  const teamId = requiredText(row, "team_id", label);
  const sourceSeason = requiredText(row, "season_name", label);
  if (sourceSeason !== String(season)) throw new Error(`${label}: season_name must be ${season}`);
  numeric(row, "minutes_played", label, true);
  return { playerId, teamId };
}

function deduplicateRows(
  rows: readonly AsaRow[],
  season: number,
  sourceName: string,
  validate: (row: AsaRow, label: string) => void,
): { rows: AsaRow[]; source: NormalizedSourceRows } {
  const unique = new Map<string, { canonical: string; row: AsaRow }>();
  const playerIds = new Set<string>();
  let duplicateRows = 0;
  for (const [index, row] of rows.entries()) {
    const label = `${sourceName} row ${index + 1}`;
    if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error(`${label}: expected an object`);
    const { playerId, teamId } = rowIdentity(row, season, label);
    validate(row, label);
    playerIds.add(playerId);
    const key = `${playerId}\u0000${teamId}\u0000${season}`;
    const canonical = canonicalStringify(row);
    const prior = unique.get(key);
    if (prior) {
      if (prior.canonical !== canonical) throw new Error(`${sourceName}: conflicting duplicate player/team/season row for ${playerId}/${teamId}/${season}`);
      duplicateRows++;
    } else {
      unique.set(key, { canonical, row });
    }
  }
  return {
    rows: [...unique.values()].map((entry) => entry.row).sort((a, b) => {
      const left = canonicalStringify(a);
      const right = canonicalStringify(b);
      return left < right ? -1 : left > right ? 1 : 0;
    }),
    source: { playerIds, duplicateRows, rawRowCount: rows.length },
  };
}

function deterministicSum(values: readonly number[]): number | undefined {
  if (!values.length) return undefined;
  return [...values].sort((a, b) => a - b).reduce((sum, value) => sum + value, 0);
}

function validateXGoalsRow(row: AsaRow, label: string): void {
  numeric(row, "shots_faced", label, true);
  numeric(row, "goals_conceded", label, true);
  numeric(row, "saves", label, true);
  numeric(row, "xgoals_gk_faced", label, true);
  numeric(row, "goals_minus_xgoals_gk", label, false);
  numeric(row, "goals_divided_by_xgoals_gk", label, true);
  numeric(row, "share_headed_shots", label, true);
}

function validateGoalsAddedRow(row: AsaRow, label: string): void {
  if (!Array.isArray(row.data)) throw new Error(`${label}: data must be an array`);
  const seen = new Set<string>();
  for (const [index, value] of row.data.entries()) {
    const componentLabel = `${label} component ${index + 1}`;
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${componentLabel}: expected an object`);
    const component = value as AsaRow;
    const action = requiredText(component, "action_type", componentLabel);
    if (!SOURCE_ACTIONS[action]) throw new Error(`${componentLabel}: unsupported action_type ${action}`);
    if (seen.has(action)) throw new Error(`${label}: duplicate action_type ${action}`);
    seen.add(action);
    if (numeric(component, "goals_added_raw", componentLabel, false) === undefined) throw new Error(`${componentLabel}: missing goals_added_raw`);
    numeric(component, "goals_added_above_avg", componentLabel, false);
    numeric(component, "count_actions", componentLabel, true);
  }
}

/** Normalize only documented additive source totals; rates and shares are omitted. */
export function normalizeGoalkeeperSeason(
  season: number,
  xGoalsRows: readonly AsaRow[],
  goalsAddedRows: readonly AsaRow[],
): GoalkeeperSeasonNormalization {
  const xGoals = deduplicateRows(xGoalsRows, season, "ASA goalkeeper xGoals", validateXGoalsRow);
  const goalsAdded = deduplicateRows(goalsAddedRows, season, "ASA goalkeeper Goals Added", validateGoalsAddedRow);
  const xGoalsByPlayer = new Map<string, Array<Partial<GoalkeeperSeasonMetrics>>>();
  for (const row of xGoals.rows) {
    const playerId = textField(row, "player_id")!;
    (xGoalsByPlayer.get(playerId) ?? xGoalsByPlayer.set(playerId, []).get(playerId)!).push({
      shotsFaced: numberField(row, "shots_faced"),
      goalsConceded: numberField(row, "goals_conceded"),
      saves: numberField(row, "saves"),
      xGoalsFaced: numberField(row, "xgoals_gk_faced"),
      goalsMinusXGoalsFaced: numberField(row, "goals_minus_xgoals_gk"),
    });
  }

  const actionsByPlayer = new Map<string, Map<GoalkeeperGoalsAddedAction, number[]>>();
  for (const row of goalsAdded.rows) {
    const playerId = textField(row, "player_id")!;
    const actions = actionsByPlayer.get(playerId) ?? new Map<GoalkeeperGoalsAddedAction, number[]>();
    actionsByPlayer.set(playerId, actions);
    for (const component of row.data as AsaRow[]) {
      const action = SOURCE_ACTIONS[textField(component, "action_type")!];
      const value = numberField(component, "goals_added_raw")!;
      (actions.get(action) ?? actions.set(action, []).get(action)!).push(value);
    }
  }

  const metricsByPlayer = new Map<string, GoalkeeperSeasonMetrics>();
  const playerIds = new Set([...xGoalsByPlayer.keys(), ...actionsByPlayer.keys()]);
  for (const playerId of [...playerIds].sort()) {
    const metrics: GoalkeeperSeasonMetrics = { season };
    const xGoalsParts = xGoalsByPlayer.get(playerId) ?? [];
    for (const field of XGOALS_FIELDS) {
      const value = deterministicSum(xGoalsParts.map((part) => part[field]).filter((part): part is number => part !== undefined));
      if (value !== undefined) metrics[field] = value;
    }
    const actions = actionsByPlayer.get(playerId);
    if (actions?.size) {
      const goalsAddedByAction: Partial<Record<GoalkeeperGoalsAddedAction, number>> = {};
      for (const action of GOALKEEPER_GOALS_ADDED_ACTIONS) {
        const value = deterministicSum(actions.get(action) ?? []);
        if (value !== undefined) goalsAddedByAction[action] = value;
      }
      if (Object.keys(goalsAddedByAction).length) {
        metrics.goalsAddedByAction = goalsAddedByAction;
        metrics.goalsAdded = deterministicSum(Object.values(goalsAddedByAction))!;
      }
    }
    if (Object.keys(metrics).length > 1) metricsByPlayer.set(playerId, metrics);
  }
  return { season, metricsByPlayer, xGoals: xGoals.source, goalsAdded: goalsAdded.source };
}

export function goalkeeperSourceAudit(
  source: NormalizedSourceRows,
  players: readonly StaticPlayer[],
): GoalkeeperSourceAudit {
  const byId = new Map(players.map((player) => [player.id, player]));
  let matchedGoalkeeperIds = 0;
  let unmatchedPlayerIds = 0;
  let nonGoalkeeperJoinConflicts = 0;
  for (const playerId of source.playerIds) {
    const player = byId.get(playerId);
    if (!player) unmatchedPlayerIds++;
    else if (player.positionGroup !== "GK") nonGoalkeeperJoinConflicts++;
    else matchedGoalkeeperIds++;
  }
  return {
    rawRowCount: source.rawRowCount,
    matchedGoalkeeperIds,
    unmatchedPlayerIds,
    duplicateRows: source.duplicateRows,
    nonGoalkeeperJoinConflicts,
    malformedRows: 0,
  };
}

export function attachGoalkeeperMetrics(
  players: StaticPlayer[],
  current: GoalkeeperSeasonNormalization,
  previous: GoalkeeperSeasonNormalization,
): void {
  for (const player of players) {
    if (player.positionGroup !== "GK") continue;
    const currentSeason = current.metricsByPlayer.get(player.id);
    const previousSeason = previous.metricsByPlayer.get(player.id);
    if (currentSeason || previousSeason) {
      player.goalkeeperMetrics = {
        ...(currentSeason ? { currentSeason } : {}),
        ...(previousSeason ? { previousSeason } : {}),
      };
    }
  }
}
