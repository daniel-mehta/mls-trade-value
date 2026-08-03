import type { RankingExportModel } from "./model.js";

export const JSON_MIME_TYPE = "application/json;charset=utf-8";

/** This explicit ranking schema is deliberately separate from localStorage. */
export function formatRankingJson(model: RankingExportModel): string {
  return `${JSON.stringify(model, null, 2)}\n`;
}
