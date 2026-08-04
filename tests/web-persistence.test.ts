// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  createPersistedRankingState,
  deserializePersistedRankingState,
  restoreBrowserSession,
  serializePersistedRankingState,
} from "../src/web/persistence.js";
import { applyBrowserVote, applySkip, buildTop25, initializeBrowserSession } from "../src/web/session.js";
import { RANKING_STORAGE_KEY, RankingStorageAdapter, type StorageLike } from "../src/web/storage.js";
import type { ComparisonPool } from "../src/data/comparisonPool.js";
import { comparisonPoolFixture, poolPlayer, zeroRandom } from "./web-fixtures.js";

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const pool = (ids: string[], dataVersion = "pool-v1"): ComparisonPool => comparisonPoolFixture(ids.map((id) => poolPlayer(id)), dataVersion);

describe("ranking storage adapter", () => {
  it("uses only the namespaced application key for missing, save, and remove", () => {
    const storage = new MemoryStorage();
    storage.setItem("other-project", "keep");
    const adapter = new RankingStorageAdapter(storage);
    expect(adapter.loadRankingState()).toEqual({ kind: "missing" });
    expect(adapter.saveRankingState("saved")).toEqual({ kind: "success" });
    expect(storage.getItem(RANKING_STORAGE_KEY)).toBe("saved");
    expect(adapter.loadRankingState()).toEqual({ kind: "success", value: "saved" });
    expect(adapter.removeRankingState()).toEqual({ kind: "success" });
    expect(storage.getItem(RANKING_STORAGE_KEY)).toBeNull();
    expect(storage.getItem("other-project")).toBe("keep");
  });

  it("handles read, write, and removal exceptions without throwing", () => {
    const broken: StorageLike = {
      getItem() { throw new Error("read blocked"); },
      setItem() { throw new Error("write blocked"); },
      removeItem() { throw new Error("remove blocked"); },
    };
    const adapter = new RankingStorageAdapter(broken);
    expect(adapter.loadRankingState().kind).toBe("unavailable");
    expect(adapter.saveRankingState("x").kind).toBe("unavailable");
    expect(adapter.removeRankingState().kind).toBe("unavailable");
  });

  it("does not mutate the in-memory session when a save fails", () => {
    const session = initializeBrowserSession(pool(["a", "b"]).players, zeroRandom);
    const before = structuredClone(session);
    const adapter = new RankingStorageAdapter({
      getItem() { return null; },
      setItem() { throw new Error("quota blocked"); },
      removeItem() {},
    });
    expect(adapter.saveRankingState(serializePersistedRankingState(session, "pool-v1")).kind).toBe("unavailable");
    expect(session).toEqual(before);
  });
});

describe("persisted ranking schema", () => {
  const sessionWithVote = () => {
    const initial = initializeBrowserSession(pool(["a", "b", "c", "d"]).players, zeroRandom);
    return applySkip(applyBrowserVote(initial, initial.currentMatchup!.playerAId, zeroRandom).session, zeroRandom);
  };

  it("round-trips normalized ratings and scheduling without player records", () => {
    const session = sessionWithVote();
    const saved = createPersistedRankingState(session, "pool-v1", "2026-08-01T00:00:00.000Z");
    const parsed = deserializePersistedRankingState(JSON.stringify(saved));
    expect(parsed.kind).toBe("valid");
    if (parsed.kind === "valid") {
      expect(parsed.state.ratings).toHaveLength(4);
      expect(JSON.stringify(parsed.state)).not.toContain("teamName");
      expect(parsed.state.skippedComparisons).toBe(1);
      expect(parsed.state.matchupState.currentPair).toEqual([session.currentMatchup!.playerAId, session.currentMatchup!.playerBId]);
      expect(parsed.state.matchupState.recentPairs).toEqual(session.recentPairs);
      expect(parsed.state.matchupState.recentPlayers).toEqual(session.recentPlayers);
    }
  });

  it("persists updated ratings and scheduler history after a vote", () => {
    const initial = initializeBrowserSession(pool(["a", "b", "c", "d"]).players, zeroRandom);
    const shown = initial.currentMatchup!;
    const voted = applyBrowserVote(initial, shown.playerAId, zeroRandom).session;
    const saved = createPersistedRankingState(voted, "pool-v1", "2026-08-01T00:00:00.000Z");
    expect(saved.completedComparisons).toBe(1);
    expect(saved.ratings.find((rating) => rating.playerId === shown.playerAId)?.comparisons).toBe(1);
    expect(saved.matchupState.recentPairs).toContain([shown.playerAId, shown.playerBId].sort().join(":"));
  });

  it("persists a skip without changing Elo or the completed total", () => {
    const initial = initializeBrowserSession(pool(["a", "b", "c", "d"]).players, zeroRandom);
    const skipped = applySkip(initial, zeroRandom);
    const saved = createPersistedRankingState(skipped, "pool-v1", "2026-08-01T00:00:00.000Z");
    expect(skipped.ratings).toBe(initial.ratings);
    expect(saved.completedComparisons).toBe(0);
    expect(saved.skippedComparisons).toBe(1);
    expect(saved.matchupState.recentPairs).toHaveLength(1);
  });

  it.each([
    ["invalid JSON", "{"],
    ["unsupported schema", JSON.stringify({ schemaVersion: 3 })],
    ["missing dataset version", JSON.stringify({ schemaVersion: 1 })],
  ])("rejects %s", (_, raw) => expect(deserializePersistedRankingState(raw).kind).toBe("invalid"));

  it("rejects invalid timestamp, duplicate IDs, invalid Elo, counts, pairs, and histories", () => {
    const base = createPersistedRankingState(sessionWithVote(), "pool-v1", "2026-08-01T00:00:00.000Z");
    const invalids = [
      { ...base, savedAt: "yesterday" },
      { ...base, ratings: [...base.ratings, base.ratings[0]] },
      { ...base, ratings: base.ratings.map((rating, index) => index === 0 ? { ...rating, rating: Number.NaN } : rating) },
      { ...base, ratings: base.ratings.map((rating, index) => index === 0 ? { ...rating, wins: -1 } : rating) },
      { ...base, ratings: base.ratings.map((rating, index) => index === 0 ? { ...rating, comparisons: 1.5 } : rating) },
      { ...base, matchupState: { ...base.matchupState, currentPair: ["a", "a"] } },
      { ...base, matchupState: { ...base.matchupState, recentPairs: [1] } },
      { ...base, matchupState: { ...base.matchupState, recentPlayers: [null] } },
    ];
    invalids.forEach((value) => expect(deserializePersistedRankingState(JSON.stringify(value)).kind).toBe("invalid"));
  });

  it("migrates version 1 without losing ratings, totals, or a valid current matchup", () => {
    const session = sessionWithVote();
    const currentPair = [session.currentMatchup!.playerAId, session.currentMatchup!.playerBId];
    const previousPair = [session.previousMatchup!.playerAId, session.previousMatchup!.playerBId];
    const legacy = {
      schemaVersion: 1,
      datasetVersion: "pool-v1",
      savedAt: "2026-08-01T00:00:00.000Z",
      ratings: createPersistedRankingState(session, "pool-v1").ratings,
      completedComparisons: session.completedComparisons,
      skippedComparisons: session.skippedMatchups,
      matchupState: { currentPair, previousPair, remainingQueue: ["a", "b"] },
    };
    const parsed = deserializePersistedRankingState(JSON.stringify(legacy));
    expect(parsed.kind).toBe("valid");
    if (parsed.kind === "valid") {
      expect(parsed.state.schemaVersion).toBe(2);
      expect(parsed.state.migratedFromSchemaVersion).toBe(1);
      expect(parsed.state.ratings).toEqual(legacy.ratings);
      expect(parsed.state.completedComparisons).toBe(1);
      expect(parsed.state.skippedComparisons).toBe(1);
      expect(parsed.state.matchupState.currentPair).toEqual(currentPair);
      const restored = restoreBrowserSession(pool(["a", "b", "c", "d"]), parsed.state, zeroRandom);
      expect(restored.kind).toBe("reconciled");
      if (restored.kind === "reconciled") expect(restored.reason).toBe("migration");
    }
  });
});

describe("restoration and dataset reconciliation", () => {
  it("preserves ranking progress when a descriptive dataset version becomes semantic", () => {
    const legacyPool = pool(["a", "b", "c", "d"], "comparison-pool-asa-mls-2026-2025-roster-2026-02-26");
    const initial = initializeBrowserSession(legacyPool.players, zeroRandom);
    const voted = applyBrowserVote(initial, initial.currentMatchup!.playerAId, zeroRandom).session;
    const saved = createPersistedRankingState(voted, legacyPool.dataVersion, "2026-08-01T00:00:00.000Z");
    const semanticPool = pool(["a", "b", "c", "d"], `sha256:${"d".repeat(64)}`);
    const restored = restoreBrowserSession(semanticPool, saved, zeroRandom);
    expect(restored.kind).toBe("reconciled");
    if (restored.kind === "reconciled") {
      expect(restored.reason).toBe("dataset");
      expect(restored.session.ratings).toEqual(voted.ratings);
      expect(restored.session.completedComparisons).toBe(voted.completedComparisons);
    }
  });

  it("restores Elo records, totals, Top 25, current matchup, and histories without mutating source players", () => {
    const source = pool(["a", "b", "c", "d"]);
    const before = structuredClone(source.players);
    const initial = initializeBrowserSession(source.players, zeroRandom);
    const voted = applyBrowserVote(initial, initial.currentMatchup!.playerAId, zeroRandom).session;
    const saved = createPersistedRankingState(voted, source.dataVersion, "2026-08-01T00:00:00.000Z");
    const restored = restoreBrowserSession(source, saved, zeroRandom);
    expect(restored.kind).toBe("restored");
    if (restored.kind === "restored") {
      expect(restored.session.ratings).toEqual(voted.ratings);
      expect(restored.session.completedComparisons).toBe(1);
      expect(restored.session.currentMatchup).toEqual(voted.currentMatchup);
      expect(restored.session.recentPairs).toEqual(voted.recentPairs);
      expect(restored.session.recentPlayers).toEqual(voted.recentPlayers);
      expect(buildTop25(restored.session)).toHaveLength(2);
      expect(Object.values(restored.session.ratings).some((rating) => rating.comparisons === 0)).toBe(true);
    }
    expect(source.players).toEqual(before);
  });

  it("preserves returning players, drops removed IDs, initializes new IDs, and rebuilds invalid scheduling", () => {
    const oldPool = pool(["a", "b", "c", "d"], "old");
    const initial = initializeBrowserSession(oldPool.players, zeroRandom);
    const voted = applyBrowserVote(initial, initial.currentMatchup!.playerAId, zeroRandom).session;
    const saved = createPersistedRankingState(voted, oldPool.dataVersion, "2026-08-01T00:00:00.000Z");
    saved.matchupState.currentPair = ["removed", "a"];
    saved.matchupState.recentPairs = ["removed:a", ...saved.matchupState.recentPairs];
    saved.matchupState.recentPlayers = ["removed", ...saved.matchupState.recentPlayers];
    const restored = restoreBrowserSession(pool(["a", "b", "new"], "new"), saved, zeroRandom);
    expect(restored.kind).toBe("reconciled");
    if (restored.kind === "reconciled") {
      expect(restored.session.ratings.new).toMatchObject({ elo: 1500, comparisons: 0 });
      expect(restored.session.ratings.removed).toBeUndefined();
      expect(restored.session.currentMatchup?.playerAId).not.toBe(restored.session.currentMatchup?.playerBId);
    }
  });

  it("filters unknown scheduler history for an unchanged dataset without discarding rankings", () => {
    const current = pool(["a", "b", "c", "d"]);
    const initial = initializeBrowserSession(current.players, zeroRandom);
    const voted = applyBrowserVote(initial, initial.currentMatchup!.playerAId, zeroRandom).session;
    const saved = createPersistedRankingState(voted, current.dataVersion, "2026-08-01T00:00:00.000Z");
    saved.matchupState.recentPairs.push("unknown:a", saved.matchupState.recentPairs[0]);
    saved.matchupState.recentPlayers.push("unknown");
    const restored = restoreBrowserSession(current, saved, zeroRandom);
    expect(restored.kind).toBe("reconciled");
    if (restored.kind === "reconciled") {
      expect(restored.session.ratings).toEqual(voted.ratings);
      expect(restored.session.recentPairs).not.toContain("unknown:a");
      expect(restored.session.recentPlayers).not.toContain("unknown");
    }
  });

  it("rebuilds a corrupt current matchup while preserving ranking progress", () => {
    const current = pool(["a", "b", "c", "d"]);
    const initial = initializeBrowserSession(current.players, zeroRandom);
    const voted = applyBrowserVote(initial, initial.currentMatchup!.playerAId, zeroRandom).session;
    const saved = createPersistedRankingState(voted, current.dataVersion, "2026-08-01T00:00:00.000Z");
    saved.matchupState.currentPair = ["unknown", "a"];
    const restored = restoreBrowserSession(current, saved, zeroRandom);
    expect(restored.kind).toBe("reconciled");
    if (restored.kind === "reconciled") {
      expect(restored.session.completedComparisons).toBe(1);
      expect(restored.session.currentMatchup?.playerAId).not.toBe(restored.session.currentMatchup?.playerBId);
    }
  });

  it("a fresh reset session clears scheduler history", () => {
    const current = pool(["a", "b", "c", "d"]);
    const initial = initializeBrowserSession(current.players, zeroRandom);
    const advanced = applySkip(initial, zeroRandom);
    expect(advanced.recentPairs.length).toBeGreaterThan(0);
    const reset = initializeBrowserSession(current.players, zeroRandom);
    expect(reset.recentPairs).toEqual([]);
    expect(reset.recentPlayers).toEqual([]);
    expect(reset.previousMatchup).toBeNull();
  });

  it("serializes deterministically when a timestamp is supplied", () => {
    const session = initializeBrowserSession(pool(["b", "a"]).players, zeroRandom);
    expect(serializePersistedRankingState(session, "pool-v1", "2026-08-01T00:00:00.000Z")).toBe(serializePersistedRankingState(session, "pool-v1", "2026-08-01T00:00:00.000Z"));
  });
});
