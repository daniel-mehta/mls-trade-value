/** Visible product copy lives here so a future rename is a one-file change. */
export const PRODUCT = {
  repositoryName: "mls-trade-value-elo",
  title: "MLS Trade Value Elo",
  subtitle:
    "Build your personal MLS player trade-value ranking through head-to-head comparisons.",
} as const;

export const DATA_NOTE =
  "2026 MLS statistics with selected 2025 context.";

/** Static roster metadata is intentionally not presented as a live roster. */
export const ROSTER_SNAPSHOT_DATE = "2026-02-26";
export const ROSTER_SNAPSHOT_LABEL = "February 26, 2026";

/** Keep browser download names product-owned and safe to reuse across formats. */
export const EXPORT_FILENAME_STEM = "mls-trade-value";
