const FALLBACK_NOTICE = "Static dataset. Generation date unavailable.";
import { ROSTER_SNAPSHOT_LABEL } from "./config.js";

const ROSTER_SNAPSHOT_NOTICE = `Roster metadata reflects ${ROSTER_SNAPSHOT_LABEL}.`;

/**
 * Describes the committed comparison-pool artifact without implying live or
 * source-coverage freshness. UTC prevents the calendar day varying by browser.
 */
export function formatDataFreshnessNotice(generatedAt: string | undefined): string {
  if (typeof generatedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(generatedAt)) {
    return FALLBACK_NOTICE;
  }

  const generatedTime = Date.parse(generatedAt);
  if (!Number.isFinite(generatedTime)) {
    return FALLBACK_NOTICE;
  }

  const readableDate = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(generatedTime));

  return `Data snapshot generated ${readableDate}. Statistics do not update automatically and may not reflect recent matches, transfers, injuries, or roster changes. ${ROSTER_SNAPSHOT_NOTICE}`;
}
