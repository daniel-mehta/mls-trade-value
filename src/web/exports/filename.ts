import { EXPORT_FILENAME_STEM } from "../config.js";

export type RankingExportKind = "csv" | "text" | "json";

function utcDate(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export function rankingExportFilename(kind: RankingExportKind, now: Date): string {
  const date = utcDate(now);
  if (kind === "text") return `${EXPORT_FILENAME_STEM}-top-25-${date}.txt`;
  return `${EXPORT_FILENAME_STEM}-ranking-${date}.${kind}`;
}
