import { describe, expect, it } from "vitest";
import { formatDataFreshnessNotice, formatSeasonContext } from "../src/web/freshness.js";

describe("data freshness notice", () => {
  it("separates artifact build, unverified coverage, roster, and salary dates", () => {
    const notice = formatDataFreshnessNotice({
      generatedAt: "2026-07-30T20:34:42.826Z",
      statisticsThrough: null,
      rosterSnapshotDate: "2026-02-26",
      rosterReleaseDate: "2026-02-27",
      salaryReleaseDate: "2026-04-16",
      salaryCurrency: "USD",
    });
    expect(notice).toContain("Dataset artifact built July 30, 2026.");
    expect(notice).toContain("Verified statistical coverage date not recorded.");
    expect(notice).toContain("Roster snapshot: February 26, 2026.");
    expect(notice).toContain("Roster release file date: February 27, 2026.");
    expect(notice).toContain("Salary release: April 16, 2026 (USD).");
  });

  it("uses metadata-provided dates instead of hard-coded February copy", () => {
    const notice = formatDataFreshnessNotice({ rosterSnapshotDate: "2027-03-10" });
    expect(notice).toContain("Roster snapshot: March 10, 2027.");
    expect(notice).not.toContain("February 26");
  });

  it("uses honest field-specific fallbacks for missing metadata", () => {
    const notice = formatDataFreshnessNotice({});
    expect(notice).toContain("Dataset artifact build date unavailable.");
    expect(notice).toContain("Verified statistical coverage date not recorded.");
    expect(notice).toContain("Roster snapshot date unavailable.");
    expect(notice).toContain("Salary release date unavailable.");
  });

  it("derives season context from artifact metadata", () => {
    expect(formatSeasonContext({ season: 2027, previousSeason: 2026 })).toBe("2027 MLS statistics with selected 2026 context.");
  });
});
