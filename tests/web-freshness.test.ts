import { describe, expect, it } from "vitest";

import { formatDataFreshnessNotice } from "../src/web/freshness.js";

describe("data freshness notice", () => {
  it("formats a valid pool generation timestamp as a readable UTC date", () => {
    const notice = formatDataFreshnessNotice("2026-07-30T20:34:42.826Z");

    expect(notice).toContain("Data snapshot generated July 30, 2026.");
    expect(notice).toContain("Statistics do not update automatically");
    expect(notice).toContain("Roster metadata reflects February 26, 2026.");
  });

  it("uses the provided metadata date rather than a hard-coded display date", () => {
    const notice = formatDataFreshnessNotice("2026-08-02T00:00:00.000Z");

    expect(notice).toContain("Data snapshot generated August 2, 2026.");
    expect(notice).not.toContain("July 30, 2026");
  });

  it.each([undefined, "", "not-a-timestamp", "2026-07-30"])(
    "uses the safe fallback when generatedAt is invalid (%j)",
    (generatedAt) => {
      expect(formatDataFreshnessNotice(generatedAt)).toBe(
        "Static dataset. Generation date unavailable.",
      );
    },
  );
});
