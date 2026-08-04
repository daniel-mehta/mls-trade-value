import type { ComparisonPoolPlayer } from "../data/comparisonPool.js";
import type { PlayerSeasonStats } from "../data/types.js";

export interface DisplayStats {
  stats: PlayerSeasonStats;
  season: number;
  usesPreviousSeason: boolean;
  notice?: string;
}

export interface DisplayField {
  label: string;
  value: string;
}

export function selectDisplayStats(player: ComparisonPoolPlayer): DisplayStats {
  if ((player.currentSeason.minutes ?? 0) > 0) {
    return {
      stats: player.currentSeason,
      season: player.currentSeason.season,
      usesPreviousSeason: false,
    };
  }
  const stats = player.previousSeason ?? player.currentSeason;
  return {
    stats,
    season: stats.season,
    usesPreviousSeason: Boolean(player.previousSeason),
    notice: player.previousSeason
      ? player.positionGroup === "GK"
        ? `No ${player.currentSeason.season} MLS minutes. Showing ${player.previousSeason.season} MLS playing time.`
        : `No ${player.currentSeason.season} MLS minutes. Showing ${player.previousSeason.season} statistics.`
      : "No MLS minutes are available for display.",
  };
}

export function formatInteger(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

export function formatDecimal(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatElo(value: number): string {
  return value.toFixed(2);
}

export function buildStatFields(stats: PlayerSeasonStats): DisplayField[] {
  const definitions: Array<[string, number | undefined, (value: number) => string]> = [
    ["Minutes", stats.minutes, formatInteger],
    ["Goals", stats.goals, formatInteger],
    ["Primary assists", stats.assists, formatInteger],
    ["xG", stats.xGoals, formatDecimal],
    ["xA", stats.xAssists, formatDecimal],
    ["Goals Added", stats.goalsAdded, formatDecimal],
  ];
  return definitions
    .filter((entry): entry is [string, number, (value: number) => string] => entry[1] !== undefined)
    .map(([label, value, formatter]) => ({ label, value: formatter(value) }));
}

export function buildGoalkeeperStatFields(stats: PlayerSeasonStats): DisplayField[] {
  const definitions: Array<[string, number | undefined, (value: number) => string]> = [
    ["Minutes", stats.minutes, formatInteger],
    ["Goals conceded", stats.goalsConceded, formatInteger],
    ["Saves", stats.saves, formatInteger],
    ["Save percentage", stats.savePercentage, (value) => `${formatDecimal(value)}%`],
    ["Expected goals against", stats.expectedGoalsAgainst, formatDecimal],
    ["Goals prevented", stats.goalsPrevented, formatDecimal],
    ["Clean sheets", stats.cleanSheets, formatInteger],
    ["Goals Added", stats.goalsAdded, formatDecimal],
  ];
  return definitions
    .filter((entry): entry is [string, number, (value: number) => string] => entry[1] !== undefined)
    .map(([label, value, formatter]) => ({ label, value: formatter(value) }));
}

export function buildPlayerStatFields(
  player: ComparisonPoolPlayer,
  stats: PlayerSeasonStats,
): DisplayField[] {
  return player.positionGroup === "GK" ? buildGoalkeeperStatFields(stats) : buildStatFields(stats);
}

export function formatPositionLine(player: ComparisonPoolPlayer): string {
  const detailedPosition = player.position?.trim();
  const positions: string[] = [player.positionGroup];
  if (detailedPosition && detailedPosition.toUpperCase() !== player.positionGroup) {
    positions.push(detailedPosition);
  }
  return `${player.teamAbbreviation} · ${positions.join(" · ")}`;
}

export function buildRosterFields(player: ComparisonPoolPlayer): DisplayField[] {
  const fields: DisplayField[] = [];
  const salary = player.guaranteedCompensation ?? player.baseSalary;
  if (salary !== undefined) fields.push({ label: "Guaranteed compensation", value: formatCurrency(salary) });
  const roster = player.rosterProfile;
  if (!roster) return fields;
  if (roster.rosterDesignation) fields.push({ label: "Roster designation", value: roster.rosterDesignation });
  if (roster.contractThrough) fields.push({ label: "Contract through", value: roster.contractThrough });
  if (roster.optionYears?.length) fields.push({ label: "Option years", value: roster.optionYears.join(", ") });
  if (roster.currentStatus) fields.push({ label: "Roster status", value: roster.currentStatus });
  if (roster.unavailable === true) fields.push({ label: "Availability", value: "Unavailable" });
  if (roster.currentStatus?.toLowerCase().includes("loan")) fields.push({ label: "Loan status", value: "On loan" });
  if (roster.permanentTransferOption !== undefined) {
    fields.push({
      label: "Permanent transfer option",
      value: roster.permanentTransferOption ? "Yes" : "No",
    });
  }
  return fields;
}
