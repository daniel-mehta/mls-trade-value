import { describe, expect, it } from "vitest";
import { rankPlayers } from "../src/domain/ranking.js";
import type { Player, Ratings } from "../src/domain/types.js";

const players: Player[] = [
  { id: "alpha", name: "Alpha", team: "AAA", position: "MID" },
  { id: "bravo", name: "Bravo", team: "BBB", position: "MID" },
];

function rankingIds(ratings: Ratings): string[] {
  return rankPlayers(players, ratings).map((entry) => entry.player.id);
}

describe("rankPlayers", () => {
  it("uses Elo as the first ranking criterion", () => {
    expect(rankingIds({
      alpha: { playerId: "alpha", elo: 1600, wins: 0, losses: 0, comparisons: 0 },
      bravo: { playerId: "bravo", elo: 1500, wins: 10, losses: 0, comparisons: 10 },
    })).toEqual(["alpha", "bravo"]);
  });

  it("uses comparison count when Elo is tied", () => {
    expect(rankingIds({
      alpha: { playerId: "alpha", elo: 1500, wins: 0, losses: 0, comparisons: 1 },
      bravo: { playerId: "bravo", elo: 1500, wins: 0, losses: 2, comparisons: 2 },
    })).toEqual(["bravo", "alpha"]);
  });

  it("uses wins when Elo and comparison count are tied", () => {
    expect(rankingIds({
      alpha: { playerId: "alpha", elo: 1500, wins: 1, losses: 1, comparisons: 2 },
      bravo: { playerId: "bravo", elo: 1500, wins: 2, losses: 0, comparisons: 2 },
    })).toEqual(["bravo", "alpha"]);
  });

  it("uses player name alphabetically when all numeric criteria are tied", () => {
    expect(rankingIds({
      alpha: { playerId: "alpha", elo: 1500, wins: 1, losses: 1, comparisons: 2 },
      bravo: { playerId: "bravo", elo: 1500, wins: 1, losses: 1, comparisons: 2 },
    })).toEqual(["alpha", "bravo"]);
  });
});
