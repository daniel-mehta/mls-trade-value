import type { RankingExportModel } from "./model.js";

export const CSV_MIME_TYPE = "text/csv;charset=utf-8";
const HEADER = ["Rank", "ASA Player ID", "Player", "Team Abbreviation", "Team", "Position Group", "Detailed Position", "Elo", "Wins", "Losses", "Comparisons"];

function csvField(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** UTF-8 BOM and CRLF make the browser download spreadsheet-friendly. */
export function formatRankingCsv(model: RankingExportModel): string {
  const rows = [HEADER, ...model.rankedPlayers.map((player) => [
    player.rank, player.playerId, player.playerName, player.teamAbbreviation,
    player.teamName, player.positionGroup, player.detailedPosition,
    player.elo.toFixed(2), player.wins, player.losses, player.comparisons,
  ])];
  return `\uFEFF${rows.map((row) => row.map(csvField).join(",")).join("\r\n")}\r\n`;
}
