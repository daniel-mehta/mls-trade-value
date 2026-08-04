import { describe, expect, it } from "vitest";
import { aggregateSeasonStats, selectDisplayedTeam, stablePlayerSort } from "../src/data/aggregation.js";
import { latestSalaryByPlayer } from "../src/data/salary.js";

describe("player season aggregation", () => {
  it("sums player-team season component rows", () => expect(aggregateSeasonStats(2026, [{ minutes: 100, goals: 1 }, { minutes: 50, goals: 2 }])).toEqual({ season: 2026, minutes: 150, goals: 3 }));
  it("handles a multi-team player without losing totals", () => expect(aggregateSeasonStats(2025, [{ appearances: 2 }, { appearances: 3 }]).appearances).toBe(5));
  it("makes source-row order irrelevant to floating-point aggregation", () => {
    const rows = [{ goalsAdded: 1e16 }, { goalsAdded: -1e16 }, { goalsAdded: 1 }];
    expect(aggregateSeasonStats(2026, rows)).toEqual(aggregateSeasonStats(2026, [...rows].reverse()));
  });
  it("sorts names and resolves a tie with stable IDs", () => expect(stablePlayerSort([{ id: "2", name: "A" }, { id: "1", name: "A" }, { id: "3", name: "B" }]).map((player) => player.id)).toEqual(["1", "2", "3"]));
  it("resolves equal current minutes by previous minutes and then stable team ID", () => {
    expect(selectDisplayedTeam([
      { teamId: "z", currentSeasonMinutes: 100, previousSeasonMinutes: 20 },
      { teamId: "a", currentSeasonMinutes: 100, previousSeasonMinutes: 30 },
    ])?.teamId).toBe("a");
    expect(selectDisplayedTeam([
      { teamId: "z", currentSeasonMinutes: 100, previousSeasonMinutes: 30 },
      { teamId: "a", currentSeasonMinutes: 100, previousSeasonMinutes: 30 },
    ])?.teamId).toBe("a");
  });
});

describe("salary release handling", () => {
  it("selects the latest MLSPA release and never sums salaries", () => {
    const result = latestSalaryByPlayer([
      { player_id: "a", mlspa_release: "2025-05-23", base_salary: 100, guaranteed_compensation: 110 },
      { player_id: "a", mlspa_release: "2025-10-01", base_salary: 120, guaranteed_compensation: 130 },
    ]);
    expect(result.get("a")).toMatchObject({ base_salary: 120, guaranteed_compensation: 130 });
  });

  it("rejects conflicting rows at the same latest release", () => {
    expect(() => latestSalaryByPlayer([
      { player_id: "a", mlspa_release: "2025-10-01", base_salary: 120 },
      { player_id: "a", mlspa_release: "2025-10-01", base_salary: 130 },
    ])).toThrow("Ambiguous salary rows");
  });
});
