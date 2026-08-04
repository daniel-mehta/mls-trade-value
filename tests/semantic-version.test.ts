import { describe, expect, it } from "vitest";
import { selectComparisonPool } from "../src/data/comparisonPool.js";
import {
  computePlayerDataVersion,
  computePoolDataVersion,
  semanticVersion,
  sha256CanonicalRows,
} from "../src/data/semanticVersion.js";
import { playerDataset, staticPlayer } from "./data-fixtures.js";

const noOverrides = { schemaVersion: 1 as const, include: [], exclude: [] };

describe("semantic artifact identity", () => {
  it("is stable for identical content and reordered object keys", () => {
    expect(semanticVersion({ a: 1, b: { c: 2 } })).toBe(semanticVersion({ b: { c: 2 }, a: 1 }));
    const first = playerDataset([staticPlayer("a")]);
    const second = structuredClone(first);
    expect(computePlayerDataVersion(first)).toBe(computePlayerDataVersion(second));
  });

  it("makes raw source row order irrelevant", () => {
    const rows = [{ id: "b", value: 2 }, { value: 1, id: "a" }];
    expect(sha256CanonicalRows(rows)).toBe(sha256CanonicalRows([...rows].reverse()));
  });

  it("excludes generatedAt and source observation time", () => {
    const first = playerDataset([staticPlayer("a")]);
    const second = structuredClone(first);
    second.generatedAt = "2026-08-04T00:00:00.000Z";
    second.sources[0].retrievedAt = "2026-08-04T00:00:00.000Z";
    expect(computePlayerDataVersion(second)).toBe(first.dataVersion);
  });

  it("changes for player statistics, salary, roster, source content, and applied overrides", () => {
    const original = playerDataset([staticPlayer("a", { baseSalary: 1 })]);
    const mutations = [
      (dataset: typeof original) => { dataset.players[0].currentSeason.minutes = 2; },
      (dataset: typeof original) => { dataset.players[0].baseSalary = 2; },
      (dataset: typeof original) => { dataset.rosterSnapshot.contentSha256 = "b".repeat(64); },
      (dataset: typeof original) => { dataset.sources[0].contentSha256 = "b".repeat(64); },
      (dataset: typeof original) => {
        dataset.overrides.appliedCount = 1;
        dataset.overrides.contentSha256 = "b".repeat(64);
        dataset.audit.appliedRosterOverrideCount = 1;
      },
    ];
    for (const mutate of mutations) {
      const changed = structuredClone(original);
      mutate(changed);
      expect(computePlayerDataVersion(changed)).not.toBe(original.dataVersion);
    }
  });

  it("changes for goalkeeper metrics and goalkeeper source content", () => {
    const original = playerDataset([staticPlayer("gk", { positionGroup: "GK" })]);
    const metrics = structuredClone(original);
    metrics.players[0].goalkeeperMetrics = {
      currentSeason: { season: 2026, saves: 3, shotsFaced: 5 },
    };
    expect(computePlayerDataVersion(metrics)).not.toBe(original.dataVersion);

    const source = structuredClone(original);
    source.sources.find((entry) => entry.sourceId === "asa-goalkeeper-xgoals-2026")!.contentSha256 = "b".repeat(64);
    expect(computePlayerDataVersion(source)).not.toBe(original.dataVersion);
  });

  it("changes the pool version for rule, membership, and selection-reason changes", () => {
    const dataset = playerDataset(Array.from({ length: 7 }, (_, index) => staticPlayer(String(index), { currentSeason: { season: 2026, minutes: 100 - index } })));
    const pool = selectComparisonPool(dataset, noOverrides, "2026-08-01T00:00:00.000Z");
    const changes = [
      (copy: typeof pool) => { (copy.selectionRules as any).baseOutfieldPlayersPerTeam = 4; },
      (copy: typeof pool) => { copy.players.pop(); },
      (copy: typeof pool) => { copy.players[0].selectionReasons = ["manual-inclusion"]; },
    ];
    for (const mutate of changes) {
      const changed = structuredClone(pool);
      mutate(changed);
      expect(computePoolDataVersion(changed)).not.toBe(pool.dataVersion);
    }
  });

  it("changes the pool version when an embedded goalkeeper field changes", () => {
    const dataset = playerDataset([staticPlayer("gk", {
      positionGroup: "GK",
      goalkeeperMetrics: { currentSeason: { season: 2026, saves: 3, shotsFaced: 5 } },
    })]);
    const pool = selectComparisonPool(dataset, noOverrides);
    const changed = structuredClone(pool);
    changed.players[0].goalkeeperMetrics!.currentSeason!.saves = 4;
    expect(computePoolDataVersion(changed)).not.toBe(pool.dataVersion);
  });

  it("produces canonically identical fixture builds except generatedAt", () => {
    const dataset = playerDataset([staticPlayer("a"), staticPlayer("b")]);
    const first = selectComparisonPool(dataset, noOverrides, "2026-08-01T00:00:00.000Z");
    const second = selectComparisonPool(dataset, noOverrides, "2026-08-02T00:00:00.000Z");
    expect(first.dataVersion).toBe(second.dataVersion);
    expect({ ...first, generatedAt: undefined }).toEqual({ ...second, generatedAt: undefined });
  });
});
