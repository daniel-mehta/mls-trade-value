import { PRODUCT } from "../config.js";
import type { BrowserSession } from "../session.js";
import { formatRankingCsv, CSV_MIME_TYPE } from "./csv.js";
import { downloadBrowserFile, type DownloadResult } from "./download.js";
import { rankingExportFilename, type RankingExportKind } from "./filename.js";
import { formatRankingJson, JSON_MIME_TYPE } from "./json.js";
import { createRankingExportModel } from "./model.js";
import type { RankingExportMetadata } from "./model.js";
import { formatTop25Text, TEXT_MIME_TYPE } from "./text.js";

export type ExportRankingResult = DownloadResult | { kind: "failure"; reason: "model"; error: unknown };

export function exportPersonalRanking(
  kind: RankingExportKind,
  session: BrowserSession,
  metadata: RankingExportMetadata,
  now = new Date(),
): ExportRankingResult {
  try {
    const model = createRankingExportModel({ session, metadata, product: PRODUCT.title, now });
    if (model.summary.rankedPlayers === 0) {
      throw new Error("Cannot export ranking: no compared players are ranked.");
    }
    const file = kind === "csv"
      ? { content: formatRankingCsv(model), mimeType: CSV_MIME_TYPE }
      : kind === "text"
        ? { content: formatTop25Text(model), mimeType: TEXT_MIME_TYPE }
        : { content: formatRankingJson(model), mimeType: JSON_MIME_TYPE };
    return downloadBrowserFile(file.content, rankingExportFilename(kind, now), file.mimeType);
  } catch (error) {
    return { kind: "failure", reason: "model", error };
  }
}
