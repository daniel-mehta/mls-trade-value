import type { RankingExportModel } from "./model.js";

export const TEXT_MIME_TYPE = "text/plain;charset=utf-8";

function exportDate(isoTimestamp: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long", day: "numeric", year: "numeric", timeZone: "UTC",
  }).format(new Date(isoTimestamp));
}

function singleLine(value: string): string {
  return value.replace(/[\r\n]+/g, " ");
}

function dateOrUnavailable(value: string | null): string {
  return value ? exportDate(`${value}T00:00:00.000Z`) : "not recorded";
}

export function formatTop25Text(model: RankingExportModel): string {
  const lines = [
    `My ${model.product} Top 25`,
    `Exported: ${exportDate(model.exportedAt)}`,
    `Source player version: ${model.dataset.sourcePlayerDataVersion}`,
    `Comparison-pool version: ${model.dataset.comparisonPoolDataVersion}`,
    `Player artifact built: ${model.dataset.playerArtifactBuiltAt ? exportDate(model.dataset.playerArtifactBuiltAt) : "unavailable"}`,
    `Comparison-pool artifact built: ${model.dataset.comparisonPoolArtifactBuiltAt ? exportDate(model.dataset.comparisonPoolArtifactBuiltAt) : "unavailable"}`,
    `Verified statistics through: ${dateOrUnavailable(model.dataset.statisticsThrough)}`,
    `Roster snapshot: ${dateOrUnavailable(model.dataset.rosterSnapshotDate)}`,
    `Roster release file: ${dateOrUnavailable(model.dataset.rosterReleaseDate)}`,
    `Salary release: ${dateOrUnavailable(model.dataset.salaryReleaseDate)}${model.dataset.salaryCurrency ? ` (${model.dataset.salaryCurrency})` : ""}`,
    `Completed comparisons: ${model.summary.completedComparisons}`,
    `Skipped comparisons: ${model.summary.skippedComparisons}`,
    "",
    ...model.rankedPlayers.slice(0, 25).map((player) =>
      `${player.rank}. ${singleLine(player.playerName)} | ${singleLine(player.teamName)} | ${singleLine(player.positionGroup)}${player.detailedPosition ? ` (${singleLine(player.detailedPosition)})` : ""} | ${player.elo.toFixed(2)} Elo | ${player.wins}-${player.losses}, ${player.comparisons} ${player.comparisons === 1 ? "comparison" : "comparisons"}`,
    ),
  ];
  return `${lines.join("\n")}\n`;
}
