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
import { poolPlayer, zeroRandom } from "./web-fixtures.js";

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const pool = (ids: string[], dataVersion = "pool-v1"): ComparisonPool => ({
  schemaVersion: 1 as const,
  dataVersion,
  sourceDataVersion: "source",
  season: 2026,
  previousSeason: 2025,
  generatedAt: "2026-08-01T00:00:00.000Z",
  selectionRules: { baseOutfieldPlayersPerTeam: 5, baseGoalkeepersPerTeam: 1, previousSeasonMinutesWeight: 0.5, currentSeasonGoalContributionThreshold: 5 },
  players: ids.map((id) => poolPlayer(id)),
});

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
    }
  });

  it.each([
    ["invalid JSON", "{"],
    ["unsupported schema", JSON.stringify({ schemaVersion: 2 })],
    ["missing dataset version", JSON.stringify({ schemaVersion: 1 })],
  ])("rejects %s", (_, raw) => expect(deserializePersistedRankingState(raw).kind).toBe("invalid"));

  it("rejects invalid timestamp, duplicate IDs, invalid Elo, counts, pairs, and queues", () => {
    const base = createPersistedRankingState(sessionWithVote(), "pool-v1", "2026-08-01T00:00:00.000Z");
    const invalids = [
      { ...base, savedAt: "yesterday" },
      { ...base, ratings: [...base.ratings, base.ratings[0]] },
      { ...base, ratings: base.ratings.map((rating, index) => index === 0 ? { ...rating, rating: Number.NaN } : rating) },
      { ...base, ratings: base.ratings.map((rating, index) => index === 0 ? { ...rating, wins: -1 } : rating) },
      { ...base, ratings: base.ratings.map((rating, index) => index === 0 ? { ...rating, comparisons: 1.5 } : rating) },
      { ...base, matchupState: { ...base.matchupState, currentPair: ["a", "a"] } },
      { ...base, matchupState: { ...base.matchupState, remainingQueue: ["a", "a"] } },
    ];
    invalids.forEach((value) => expect(deserializePersistedRankingState(JSON.stringify(value)).kind).toBe("invalid"));
  });
});

describe("restoration and dataset reconciliation", () => {
  it("restores Elo records, totals, Top 25, current matchup, and queue without mutating source players", () => {
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
    saved.matchupState.remainingQueue = ["removed", "b"];
    const restored = restoreBrowserSession(pool(["a", "b", "new"], "new"), saved, zeroRandom);
    expect(restored.kind).toBe("reconciled");
    if (restored.kind === "reconciled") {
      expect(restored.session.ratings.new).toMatchObject({ elo: 1500, comparisons: 0 });
      expect(restored.session.ratings.removed).toBeUndefined();
      expect(restored.session.currentMatchup?.playerAId).not.toBe(restored.session.currentMatchup?.playerBId);
    }
  });

  it("rejects unknown IDs for an unchanged dataset", () => {
    const current = pool(["a", "b", "c", "d"]);
    const saved = createPersistedRankingState(initializeBrowserSession(current.players, zeroRandom), current.dataVersion, "2026-08-01T00:00:00.000Z");
    saved.matchupState.remainingQueue = ["unknown"];
    expect(restoreBrowserSession(current, saved, zeroRandom).kind).toBe("invalid");
  });

  it("serializes deterministically when a timestamp is supplied", () => {
    const session = initializeBrowserSession(pool(["b", "a"]).players, zeroRandom);
    expect(serializePersistedRankingState(session, "pool-v1", "2026-08-01T00:00:00.000Z")).toBe(serializePersistedRankingState(session, "pool-v1", "2026-08-01T00:00:00.000Z"));
  });
});
