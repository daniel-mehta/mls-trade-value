import { describe, expect, it } from "vitest";
import {
  buildGoalkeeperStatFields,
  buildPlayerStatFields,
  buildRosterFields,
  buildStatFields,
  formatCurrency,
  formatDecimal,
  formatPositionLine,
  selectDisplayStats,
} from "../src/web/display.js";
import { poolPlayer } from "./web-fixtures.js";

describe("player-card display values", () => {
  it("selects 2026 statistics when current-season minutes are positive", () => {
    const selected = selectDisplayStats(poolPlayer("a", { currentSeason: { season: 2026, minutes: 1 } }));
    expect(selected).toMatchObject({ season: 2026, usesPreviousSeason: false });
    expect(selected.notice).toBeUndefined();
  });

  it("falls back to clearly labelled 2025 statistics for zero 2026 minutes", () => {
    const selected = selectDisplayStats(poolPlayer("a", {
      currentSeason: { season: 2026, minutes: 0 },
      previousSeason: { season: 2025, minutes: 800 },
    }));
    expect(selected).toMatchObject({ season: 2025, usesPreviousSeason: true });
    expect(selected.notice).toBe("No 2026 MLS minutes. Showing 2025 statistics.");
  });

  it("omits missing optional statistic fields", () => {
    expect(buildStatFields({ season: 2026, minutes: 100 }).map((field) => field.label)).toEqual(["Minutes"]);
  });

  it("omits missing optional roster and contract fields", () => {
    expect(buildRosterFields(poolPlayer("a", { baseSalary: undefined, guaranteedCompensation: undefined, rosterProfile: undefined }))).toEqual([]);
  });

  it("formats decimals to at most two decimal places", () => {
    expect(formatDecimal(1)).toBe("1");
    expect(formatDecimal(1.236)).toBe("1.24");
  });

  it("formats salary as US currency with thousands separators", () => {
    expect(formatCurrency(1234567)).toBe("$1,234,567");
  });

  it("displays normalized contract option years", () => {
    const fields = buildRosterFields(poolPlayer("a", {
      rosterProfile: {
        snapshotDate: "2026-02-26",
        listedInRosterSnapshot: true,
        activeAtRosterSnapshot: true,
        snapshotTeamId: "team-a",
        snapshotTeamName: "Team A",
        optionYears: ["2027", "2028"],
      },
    }));
    expect(fields).toContainEqual({ label: "Option years", value: "2027, 2028" });
  });

  it("displays unavailable and loan status when present", () => {
    const fields = buildRosterFields(poolPlayer("a", {
      rosterProfile: {
        snapshotDate: "2026-02-26",
        listedInRosterSnapshot: true,
        activeAtRosterSnapshot: false,
        snapshotTeamId: "team-a",
        snapshotTeamName: "Team A",
        currentStatus: "Unavailable - On Loan",
        unavailable: true,
      },
    }));
    expect(fields).toEqual(expect.arrayContaining([
      { label: "Roster status", value: "Unavailable - On Loan" },
      { label: "Availability", value: "Unavailable" },
      { label: "Loan status", value: "On loan" },
    ]));
  });

  it("displays a permanent transfer option only when supplied", () => {
    const fields = buildRosterFields(poolPlayer("a", {
      rosterProfile: {
        snapshotDate: "2026-02-26",
        listedInRosterSnapshot: true,
        activeAtRosterSnapshot: true,
        snapshotTeamId: "team-a",
        snapshotTeamName: "Team A",
        permanentTransferOption: true,
      },
    }));
    expect(fields).toContainEqual({ label: "Permanent transfer option", value: "Yes" });
  });

  it("omits attacking zeros from goalkeeper statistics", () => {
    const goalkeeper = poolPlayer("gk", {
      positionGroup: "GK",
      position: "GK",
      currentSeason: {
        season: 2026,
        minutes: 1725,
        goals: 0,
        assists: 0,
        xGoals: 0,
        xAssists: 0,
      },
    });
    expect(buildPlayerStatFields(goalkeeper, goalkeeper.currentSeason).map((field) => field.label)).toEqual(["Minutes"]);
  });

  it("displays goalkeeper minutes", () => {
    expect(buildGoalkeeperStatFields({ season: 2026, minutes: 1725 })).toContainEqual({
      label: "Minutes",
      value: "1,725",
    });
  });

  it("displays available goalkeeper-specific metrics", () => {
    expect(buildGoalkeeperStatFields(
      { season: 2026, minutes: 900 },
      {
        season: 2026,
        goalsConceded: 10,
        saves: 42,
        shotsFaced: 52,
        xGoalsFaced: 12.345,
        goalsMinusXGoalsFaced: -2.345,
        goalsAdded: 1.234,
      },
    )).toEqual([
      { label: "Minutes", value: "900" },
      { label: "Saves", value: "42" },
      { label: "Shots faced", value: "52" },
      { label: "xG faced", value: "12.35" },
      { label: "Goals − xG faced", value: "-2.35" },
      { label: "Goalkeeper Goals Added", value: "1.23" },
    ]);
  });

  it("omits unavailable goalkeeper-specific metrics cleanly", () => {
    expect(buildGoalkeeperStatFields({ season: 2026, minutes: 90 })).toEqual([
      { label: "Minutes", value: "90" },
    ]);
  });

  it("labels a goalkeeper's 2025 playing-time fallback", () => {
    const selected = selectDisplayStats(poolPlayer("gk", {
      positionGroup: "GK",
      position: "GK",
      currentSeason: { season: 2026 },
      previousSeason: { season: 2025, minutes: 1800, goals: 0, xGoals: 0 },
    }));
    expect(selected.notice).toBe("No 2026 MLS minutes. Showing 2025 MLS playing time.");
    expect(buildGoalkeeperStatFields(selected.stats)).toEqual([{ label: "Minutes", value: "1,800" }]);
  });

  it("labels and displays a goalkeeper's previous-season metric fallback", () => {
    const selected = selectDisplayStats(poolPlayer("gk", {
      positionGroup: "GK",
      position: "GK",
      currentSeason: { season: 2026 },
      previousSeason: { season: 2025, minutes: 1800 },
      goalkeeperMetrics: {
        previousSeason: { season: 2025, saves: 70, shotsFaced: 90 },
      },
    }));
    expect(selected.notice).toBe("No 2026 MLS minutes. Showing available 2025 goalkeeper statistics.");
    expect(buildGoalkeeperStatFields(selected.stats, selected.goalkeeperMetrics)).toEqual([
      { label: "Minutes", value: "1,800" },
      { label: "Saves", value: "70" },
      { label: "Shots faced", value: "90" },
    ]);
  });

  it("removes duplicate broad and detailed position labels", () => {
    expect(formatPositionLine(poolPlayer("gk", {
      teamAbbreviation: "NYRB",
      positionGroup: "GK",
      position: "GK",
    }))).toBe("NYRB · GK");
  });

  it("retains distinct broad and detailed position labels", () => {
    expect(formatPositionLine(poolPlayer("mid", {
      teamAbbreviation: "SEA",
      positionGroup: "MID",
      position: "AM",
    }))).toBe("SEA · MID · AM");
  });

  it("keeps the outfield statistical template unchanged", () => {
    const outfield = poolPlayer("mid", {
      currentSeason: {
        season: 2026,
        minutes: 1000,
        goals: 4,
        assists: 5,
        xGoals: 3.456,
        xAssists: 4.567,
        goalsAdded: 2.345,
      },
    });
    expect(buildPlayerStatFields(outfield, outfield.currentSeason)).toEqual(
      buildStatFields(outfield.currentSeason),
    );
  });
});
