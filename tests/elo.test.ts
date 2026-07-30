import { describe, expect, it } from "vitest";
import {
  applyVote,
  calculateExpectedScore,
  calculateNewRatings,
  initializeRatings,
} from "../src/domain/elo.js";
import { rankPlayers } from "../src/domain/ranking.js";
import type { Player } from "../src/domain/types.js";

const players: Player[] = [
  { id: "a", name: "Avery", team: "AAA", position: "MID" },
  { id: "b", name: "Blake", team: "BBB", position: "FWD" },
  { id: "c", name: "Casey", team: "CCC", position: "DEF" },
];

describe("Elo calculations", () => {
  it("returns 0.5 as the expected score for equal ratings", () => {
    expect(calculateExpectedScore(1500, 1500)).toBeCloseTo(0.5);
  });

  it("returns an expected score above 0.5 for the higher-rated player", () => {
    expect(calculateExpectedScore(1600, 1500)).toBeGreaterThan(0.5);
  });

  it("returns an expected score below 0.5 for the lower-rated player", () => {
    expect(calculateExpectedScore(1400, 1500)).toBeLessThan(0.5);
  });

  it("increases the winner's Elo", () => {
    expect(calculateNewRatings(1500, 1500).winnerElo).toBeGreaterThan(1500);
  });

  it("decreases the loser's Elo", () => {
    expect(calculateNewRatings(1500, 1500).loserElo).toBeLessThan(1500);
  });

  it("balances Elo gained by the winner and lost by the loser", () => {
    const { winnerElo, loserElo } = calculateNewRatings(1500, 1500);
    expect(winnerElo + loserElo).toBeCloseTo(3000);
  });

  it("initializes one empty rating record per player", () => {
    expect(initializeRatings(players, 1600)).toEqual({
      a: { playerId: "a", elo: 1600, wins: 0, losses: 0, comparisons: 0 },
      b: { playerId: "b", elo: 1600, wins: 0, losses: 0, comparisons: 0 },
      c: { playerId: "c", elo: 1600, wins: 0, losses: 0, comparisons: 0 },
    });
  });

  it("updates wins, losses, and comparison counts for both participants", () => {
    const result = applyVote(initializeRatings(players), "a", "b");
    expect(result.a).toMatchObject({ wins: 1, losses: 0, comparisons: 1 });
    expect(result.b).toMatchObject({ wins: 0, losses: 1, comparisons: 1 });
  });

  it("leaves uninvolved player ratings unchanged", () => {
    const initial = initializeRatings(players);
    const result = applyVote(initial, "a", "b");
    expect(result.c).toBe(initial.c);
  });

  it("does not mutate input ratings", () => {
    const initial = initializeRatings(players);
    const before = structuredClone(initial);
    applyVote(initial, "a", "b");
    expect(initial).toEqual(before);
  });

  it("rejects self-comparisons", () => {
    expect(() => applyVote(initializeRatings(players), "a", "a")).toThrow(
      "cannot be compared against themselves",
    );
  });

  it("rejects an unknown winner ID", () => {
    expect(() => applyVote(initializeRatings(players), "missing", "b")).toThrow(
      "Unknown winner player ID: missing",
    );
  });

  it("rejects an unknown loser ID", () => {
    expect(() => applyVote(initializeRatings(players), "a", "missing")).toThrow(
      "Unknown loser player ID: missing",
    );
  });

  it("replays a fixed vote sequence into the same ranking", () => {
    const votes: Array<[string, string]> = [["a", "b"], ["c", "a"], ["a", "b"]];
    const replayRanking = () => {
      const ratings = votes.reduce(
        (state, [winner, loser]) => applyVote(state, winner, loser),
        initializeRatings(players),
      );
      return rankPlayers(players, ratings).map((entry) => entry.player.id);
    };

    expect(replayRanking()).toEqual(replayRanking());
  });
});
