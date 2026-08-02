import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import type { ComparisonPoolPlayer } from "../src/data/comparisonPool.js";
import type { ComparisonPool } from "../src/data/comparisonPool.js";
import { initializeRatings } from "../src/domain/elo.js";
import type { Ratings } from "../src/domain/types.js";
import { SCHEDULER_CONFIG } from "../src/web/scheduler/config.js";
import { featuredPriorityComponents, calculateFeaturedPriority, isFeaturedPriorityPlayer } from "../src/web/scheduler/featured.js";
import { appendMatchupHistory, recentPlayerPenalty } from "../src/web/scheduler/history.js";
import { createPairKey } from "../src/web/scheduler/pair.js";
import { selectNextMatchup } from "../src/web/scheduler/select.js";
import type { SchedulerInput } from "../src/web/scheduler/types.js";
import { eloSimilarityInfluence, prominenceInfluence, usesEloSimilarityPreference } from "../src/web/scheduler/weights.js";
import { applyBrowserVote, initializeBrowserSession, pairKey } from "../src/web/session.js";
import { poolPlayer, seededRandom, zeroRandom } from "./web-fixtures.js";

const players = (count: number) => Array.from({ length: count }, (_, index) =>
  poolPlayer(`p${index}`, {
    positionGroup: (["GK", "DEF", "MID", "FWD"] as const)[index % 4],
    selectionReasons: index % 4 === 0 ? ["team-goalkeeper-selection"] : ["team-outfield-selection"],
  }));

function input(
  source = players(6),
  overrides: Partial<Omit<SchedulerInput, "players" | "ratings">> & { ratings?: Ratings } = {},
): SchedulerInput {
  const eloPlayers = source.map((player) => ({ id: player.id, name: player.name, team: player.teamAbbreviation, position: player.positionGroup }));
  return {
    players: source,
    ratings: overrides.ratings ?? initializeRatings(eloPlayers),
    completedComparisons: overrides.completedComparisons ?? 0,
    recentPlayers: overrides.recentPlayers ?? [],
    recentPairs: overrides.recentPairs ?? [],
    previousPair: overrides.previousPair ?? null,
    random: overrides.random ?? zeroRandom,
  };
}

function selected(result: ReturnType<typeof selectNextMatchup>) {
  expect(result.kind).toBe("selected");
  if (result.kind !== "selected") throw new Error("Expected a selected matchup");
  return result;
}

describe("pair validity and deterministic selection", () => {
  it("normalizes reversed pairs to the same key", () => {
    expect(createPairKey("a", "b")).toBe(createPairKey("b", "a"));
  });

  it("never returns a self-matchup or an ID missing from ratings", () => {
    const source = players(4);
    const ratings = initializeRatings(source.slice(0, 3).map((player) => ({ id: player.id, name: player.name, team: player.teamAbbreviation, position: player.positionGroup })));
    const result = selected(selectNextMatchup(input(source, { ratings })));
    expect(result.matchup.playerAId).not.toBe(result.matchup.playerBId);
    expect(ratings[result.matchup.playerAId]).toBeDefined();
    expect(ratings[result.matchup.playerBId]).toBeDefined();
  });

  it("returns an explicit insufficient-pool result for zero or one valid player", () => {
    expect(selectNextMatchup(input([], { ratings: {} }))).toEqual({ kind: "insufficient-pool", validPlayerCount: 0 });
    expect(selectNextMatchup(input(players(1)))).toEqual({ kind: "insufficient-pool", validPlayerCount: 1 });
  });

  it("handles a two-player pool without a self-matchup and relaxes the sole repeated pair", () => {
    const source = players(2);
    const previousPair = { playerAId: source[0].id, playerBId: source[1].id };
    const result = selected(selectNextMatchup(input(source, {
      previousPair,
      recentPairs: [createPairKey(previousPair.playerAId, previousPair.playerBId)],
      recentPlayers: [previousPair.playerAId, previousPair.playerBId],
    })));
    expect(createPairKey(result.matchup.playerAId, result.matchup.playerBId)).toBe(createPairKey(source[0].id, source[1].id));
    expect(result.diagnostics.relaxation).toBe("single-pair-fallback");
  });

  it("broadens a coverage tie rather than immediately repeating a pair in a larger pool", () => {
    const source = players(3);
    const ratings = input(source).ratings;
    ratings.p2 = { playerId: "p2", elo: 1500, wins: 1, losses: 0, comparisons: 1 };
    const previousPair = { playerAId: "p0", playerBId: "p1" };
    const result = selected(selectNextMatchup(input(source, {
      ratings,
      previousPair,
      recentPairs: [createPairKey("p0", "p1")],
      recentPlayers: ["p0", "p1"],
    })));
    expect(createPairKey(result.matchup.playerAId, result.matchup.playerBId)).not.toBe(createPairKey("p0", "p1"));
    expect(result.diagnostics.relaxation).toBe("coverage-fallback");
  });

  it("produces identical choices for identical seeds and allows different tie outcomes", () => {
    const first = selected(selectNextMatchup(input(players(10), { random: seededRandom(17) }))).matchup;
    const replay = selected(selectNextMatchup(input(players(10), { random: seededRandom(17) }))).matchup;
    const different = selected(selectNextMatchup(input(players(10), { random: seededRandom(29) }))).matchup;
    expect(first).toEqual(replay);
    expect(createPairKey(different.playerAId, different.playerBId)).not.toBe(createPairKey(first.playerAId, first.playerBId));
  });

  it("does not use ambient Math.random when a source is injected", () => {
    const ambient = vi.spyOn(Math, "random").mockImplementation(() => { throw new Error("ambient random used"); });
    expect(() => selectNextMatchup(input(players(6), { random: seededRandom(1) }))).not.toThrow();
    ambient.mockRestore();
  });

  it("never selects an invalid pair across many seeds", () => {
    const source = players(12);
    const validIds = new Set(source.map((player) => player.id));
    for (let seed = 0; seed < 50; seed += 1) {
      const matchup = selected(selectNextMatchup(input(source, { random: seededRandom(seed) }))).matchup;
      expect(matchup.playerAId).not.toBe(matchup.playerBId);
      expect(validIds.has(matchup.playerAId)).toBe(true);
      expect(validIds.has(matchup.playerBId)).toBe(true);
    }
  });
});

describe("coverage policy", () => {
  it("prefers two unseen players over heavily compared players", () => {
    const source = players(6);
    const ratings = input(source).ratings;
    for (const id of ["p0", "p1", "p2", "p3"]) ratings[id] = { playerId: id, elo: 1500, wins: 5, losses: 5, comparisons: 10 };
    const matchup = selected(selectNextMatchup(input(source, { ratings }))).matchup;
    expect(new Set(Object.values(matchup))).toEqual(new Set(["p4", "p5"]));
  });

  it("prefers the lowest-comparison players and lets neglected players override Elo similarity", () => {
    const source = players(4);
    const ratings = input(source).ratings;
    ratings.p0 = { playerId: "p0", elo: 1100, wins: 0, losses: 0, comparisons: 0 };
    ratings.p1 = { playerId: "p1", elo: 1900, wins: 0, losses: 0, comparisons: 0 };
    ratings.p2 = { playerId: "p2", elo: 1500, wins: 10, losses: 10, comparisons: 20 };
    ratings.p3 = { playerId: "p3", elo: 1501, wins: 10, losses: 10, comparisons: 20 };
    const matchup = selected(selectNextMatchup(input(source, { ratings, completedComparisons: 200 }))).matchup;
    expect(new Set(Object.values(matchup))).toEqual(new Set(["p0", "p1"]));
  });

  it("does not let featured status override neglected-player coverage", () => {
    const source = players(4).map((player, index) => index < 2
      ? { ...player, selectionReasons: ["designated-player"] as ComparisonPoolPlayer["selectionReasons"] }
      : player);
    const ratings = input(source).ratings;
    ratings.p0 = { playerId: "p0", elo: 1500, wins: 5, losses: 5, comparisons: 10 };
    ratings.p1 = { playerId: "p1", elo: 1500, wins: 5, losses: 5, comparisons: 10 };
    const matchup = selected(selectNextMatchup(input(source, { ratings }))).matchup;
    expect(new Set(Object.values(matchup))).toEqual(new Set(["p2", "p3"]));
  });

  it("covers goalkeepers and every position group in a deterministic session", () => {
    let session = initializeBrowserSession(players(24), seededRandom(7));
    const shown = new Set<string>();
    for (let index = 0; index < 20; index += 1) {
      Object.values(session.currentMatchup!).forEach((id) => shown.add(id));
      session = applyBrowserVote(session, session.currentMatchup!.playerAId, seededRandom(100 + index)).session;
    }
    const groups = new Set(session.players.filter((player) => shown.has(player.id)).map((player) => player.positionGroup));
    expect(groups).toEqual(new Set(["GK", "DEF", "MID", "FWD"]));
  });

  it("keeps comparison-count disparity bounded over a long deterministic session", () => {
    let session = initializeBrowserSession(players(48), seededRandom(11));
    for (let index = 0; index < 240; index += 1) {
      session = applyBrowserVote(session, session.currentMatchup!.playerAId, seededRandom(index + 40)).session;
    }
    const counts = Object.values(session.ratings).map((rating) => rating.comparisons);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(2);
  });
});

describe("cooldowns and bounded histories", () => {
  it("avoids consecutive players and recent reversed pairs when alternatives exist", () => {
    const source = players(8);
    const previousPair = { playerAId: "p0", playerBId: "p1" };
    const result = selected(selectNextMatchup(input(source, {
      previousPair,
      recentPlayers: ["p0", "p1"],
      recentPairs: [createPairKey("p3", "p2"), createPairKey("p0", "p1")],
    })));
    expect(Object.values(result.matchup)).not.toContain("p0");
    expect(Object.values(result.matchup)).not.toContain("p1");
    expect(createPairKey(result.matchup.playerAId, result.matchup.playerBId)).not.toBe(createPairKey("p2", "p3"));
  });

  it("gives older player appearances a smaller penalty", () => {
    const matchup = { playerAId: "a", playerBId: "b" };
    expect(recentPlayerPenalty(matchup, ["a", "x"])).toBeLessThan(recentPlayerPenalty(matchup, ["x", "a"]));
  });

  it("relaxes player cooldowns before old pair cooldowns and never deadlocks", () => {
    const source = players(3);
    const recentPairs = [createPairKey("p0", "p1"), createPairKey("p0", "p2"), createPairKey("p1", "p2")];
    const result = selected(selectNextMatchup(input(source, {
      previousPair: { playerAId: "p1", playerBId: "p2" },
      recentPlayers: ["p0", "p1", "p2"],
      recentPairs,
    })));
    expect(result.diagnostics.relaxation).toBe("older-pairs");
    expect(result.matchup.playerAId).not.toBe(result.matchup.playerBId);
  });

  it("bounds player and pair histories while allowing old pairs to return", () => {
    let recentPairs: string[] = [];
    let recentPlayers: string[] = [];
    for (let index = 0; index < 40; index += 1) {
      ({ recentPairs, recentPlayers } = appendMatchupHistory(recentPairs, recentPlayers, {
        playerAId: `a${index}`,
        playerBId: `b${index}`,
      }));
    }
    expect(recentPairs).toHaveLength(SCHEDULER_CONFIG.recentPairLimit);
    expect(recentPlayers).toHaveLength(SCHEDULER_CONFIG.recentPlayerLimit);
    expect(recentPairs).not.toContain(createPairKey("a0", "b0"));
  });
});

describe("featured priority and decay", () => {
  it("derives every signal from metadata rather than names", () => {
    const player = poolPlayer("anonymous", {
      name: "Nobody Special",
      currentSeason: { season: 2026, minutes: 950, goals: 3, assists: 2 },
      selectionReasons: ["team-outfield-selection", "designated-player", "u22-initiative"],
    });
    expect(featuredPriorityComponents(player)).toEqual({
      designatedPlayer: 3,
      u22Initiative: 2,
      currentSeasonGoalContributions: 2,
      baseTeamSelection: 1,
      highParticipation: 1,
    });
    expect(calculateFeaturedPriority(player)).toBe(9);
  });

  it("allows goalkeepers to qualify through valid non-attacking metadata", () => {
    const goalkeeper = poolPlayer("gk", {
      positionGroup: "GK",
      currentSeason: { season: 2026, minutes: 1000 },
      selectionReasons: ["team-goalkeeper-selection", "designated-player"],
    });
    expect(isFeaturedPriorityPlayer(goalkeeper)).toBe(true);
  });

  it("does not let salary dominate featured status", () => {
    const highSalary = poolPlayer("rich", { baseSalary: 20_000_000, guaranteedCompensation: 25_000_000 });
    const designated = poolPlayer("dp", { baseSalary: 1, selectionReasons: ["designated-player"] });
    expect(isFeaturedPriorityPlayer(highSalary)).toBe(false);
    expect(isFeaturedPriorityPlayer(designated)).toBe(true);
  });

  it("produces a deterministic 65% exactly-one-featured rate in the first 20 comparisons", () => {
    const source = Array.from({ length: 60 }, (_, index) => poolPlayer(`f${index}`, {
      selectionReasons: index < 20 ? ["designated-player"] : ["manual-inclusion"],
    }));
    let session = initializeBrowserSession(source, seededRandom(42));
    let exactlyOne = 0;
    let twoFeatured = 0;
    for (let index = 0; index < 20; index += 1) {
      const ids = Object.values(session.currentMatchup!);
      const featured = ids.filter((id) => isFeaturedPriorityPlayer(source.find((player) => player.id === id)!)).length;
      exactlyOne += Number(featured === 1);
      twoFeatured += Number(featured === 2);
      session = applyBrowserVote(session, session.currentMatchup!.playerAId, seededRandom(200 + index)).session;
    }
    expect(exactlyOne / 20).toBe(0.65);
    expect(twoFeatured).toBe(0);
  });

  it("decays prominence smoothly and removes its influence by 50 comparisons", () => {
    expect(prominenceInfluence(20)).toBe(1);
    expect(prominenceInfluence(35)).toBeCloseTo(0.5);
    expect(prominenceInfluence(50)).toBe(0);
    const source = players(6);
    const withMetadata = source.map((player, index) => index < 3 ? { ...player, selectionReasons: ["designated-player"] as ComparisonPoolPlayer["selectionReasons"] } : player);
    const plain = source.map((player) => ({ ...player, selectionReasons: ["manual-inclusion"] as ComparisonPoolPlayer["selectionReasons"] }));
    const first = selected(selectNextMatchup(input(withMetadata, { completedComparisons: 50, random: seededRandom(9) })));
    const second = selected(selectNextMatchup(input(plain, { completedComparisons: 50, random: seededRandom(9) })));
    expect(first.matchup).toEqual(second.matchup);
    expect(first.diagnostics.featuredInfluence).toBe(0);
  });
});

describe("Elo similarity ramp", () => {
  it("has no influence through 50 comparisons and increases smoothly afterward", () => {
    expect(eloSimilarityInfluence(0)).toBe(0);
    expect(eloSimilarityInfluence(50)).toBe(0);
    expect(eloSimilarityInfluence(80)).toBeCloseTo(0.5);
    expect(eloSimilarityInfluence(110)).toBe(1);
    expect(usesEloSimilarityPreference(110)).toBe(true);
    expect(usesEloSimilarityPreference(112)).toBe(false);
  });

  it("ignores Elo differences at the start", () => {
    const source = players(6);
    const ratings = input(source).ratings;
    const baseline = selected(selectNextMatchup(input(source, { ratings: structuredClone(ratings), random: seededRandom(33) }))).matchup;
    Object.values(ratings).forEach((rating, index) => { rating.elo = 1000 + index * 250; });
    const changed = selected(selectNextMatchup(input(source, { ratings, random: seededRandom(33) }))).matchup;
    expect(changed).toEqual(baseline);
  });

  it("prefers similar ratings later when coverage and cooldowns are equal", () => {
    const source = players(4);
    const ratings = input(source).ratings;
    ratings.p0.elo = 1500;
    ratings.p1.elo = 1510;
    ratings.p2.elo = 1800;
    ratings.p3.elo = 1810;
    const result = selected(selectNextMatchup(input(source, { ratings, completedComparisons: 110 })));
    expect(result.diagnostics.eloDifference).toBe(10);
  });

  it("keeps periodic late bridge selections free of Elo-similarity pressure", () => {
    const result = selected(selectNextMatchup(input(players(8), {
      completedComparisons: 112,
      random: seededRandom(18),
    })));
    expect(result.diagnostics.eloSimilarityInfluence).toBe(0);
  });

  it("does not mutate Elo records while scheduling", () => {
    const state = input(players(8), { completedComparisons: 110, random: seededRandom(5) });
    const before = structuredClone(state.ratings);
    selectNextMatchup(state);
    expect(state.ratings).toEqual(before);
  });
});

describe("scheduler performance", () => {
  it("selects responsively from the full 303-player pool", () => {
    const currentPool = JSON.parse(readFileSync(new URL("../public/data/comparison-pool.json", import.meta.url), "utf8")) as ComparisonPool;
    const source = currentPool.players;
    expect(source).toHaveLength(303);
    const startedAt = performance.now();
    const result = selectNextMatchup(input(source, { random: seededRandom(123) }));
    expect(result.kind).toBe("selected");
    expect(performance.now() - startedAt).toBeLessThan(2_000);
  });

  it("does not grow histories during repeated selection without completed matchups", () => {
    const state = input(players(40), { random: seededRandom(3) });
    for (let index = 0; index < 100; index += 1) selectNextMatchup(state);
    expect(state.recentPairs).toHaveLength(0);
    expect(state.recentPlayers).toHaveLength(0);
  });
});
