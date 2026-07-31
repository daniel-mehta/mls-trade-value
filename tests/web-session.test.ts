import { describe, expect, it } from "vitest";
import { calculateNewRatings } from "../src/domain/elo.js";
import {
  applyBrowserVote,
  applySkip,
  buildTop25,
  getComparedRank,
  initializeBrowserSession,
  isPlayerUnranked,
  pairKey,
  rankComparedPlayers,
  selectNextMatchup,
} from "../src/web/session.js";
import { poolPlayer, zeroRandom } from "./web-fixtures.js";

const players = (count: number) =>
  Array.from({ length: count }, (_, index) => poolPlayer(String.fromCharCode(97 + index)));

describe("browser session initialization", () => {
  it("initializes every Elo rating at 1500", () => {
    const session = initializeBrowserSession(players(4), zeroRandom);
    expect(Object.values(session.ratings).every((rating) => rating.elo === 1500)).toBe(true);
  });

  it("initializes wins, losses, and comparisons at zero", () => {
    const session = initializeBrowserSession(players(4), zeroRandom);
    expect(Object.values(session.ratings).every((rating) => rating.wins === 0 && rating.losses === 0 && rating.comparisons === 0)).toBe(true);
  });

  it("does not mutate source pool players", () => {
    const source = players(4);
    const before = structuredClone(source);
    initializeBrowserSession(source, zeroRandom);
    expect(source).toEqual(before);
  });
});

describe("browser matchup queue", () => {
  it("never pairs a player with themselves", () => {
    let session = initializeBrowserSession(players(6), zeroRandom);
    for (let index = 0; index < 20; index += 1) {
      expect(session.currentMatchup?.playerAId).not.toBe(session.currentMatchup?.playerBId);
      session = applySkip(session, zeroRandom);
    }
  });

  it("keeps consecutive pairs non-overlapping while unused queue players remain", () => {
    const first = initializeBrowserSession(players(6), zeroRandom);
    const second = applySkip(first, zeroRandom);
    const firstIds = new Set(Object.values(first.currentMatchup!));
    expect(Object.values(second.currentMatchup!).every((id) => !firstIds.has(id))).toBe(true);
  });

  it("skip leaves every Elo record unchanged", () => {
    const session = initializeBrowserSession(players(4), zeroRandom);
    const ratings = session.ratings;
    const skipped = applySkip(session, zeroRandom);
    expect(skipped.ratings).toBe(ratings);
  });

  it("skip advances to another matchup", () => {
    const session = initializeBrowserSession(players(4), zeroRandom);
    expect(pairKey(applySkip(session, zeroRandom).currentMatchup!)).not.toBe(pairKey(session.currentMatchup!));
  });

  it("vote advances to another matchup", () => {
    const session = initializeBrowserSession(players(4), zeroRandom);
    const voted = applyBrowserVote(session, session.currentMatchup!.playerAId, zeroRandom).session;
    expect(pairKey(voted.currentMatchup!)).not.toBe(pairKey(session.currentMatchup!));
  });

  it("exhausting the queue causes a reshuffle", () => {
    let session = initializeBrowserSession(players(4), zeroRandom);
    session = applySkip(session, zeroRandom);
    expect(session.queueIndex).toBe(4);
    const oldQueue = session.queue;
    session = applySkip(session, () => 0.75);
    expect(session.queueIndex).toBe(2);
    expect(session.queue).not.toBe(oldQueue);
  });

  it("does not immediately repeat the previous pair after reshuffling when avoidable", () => {
    let session = initializeBrowserSession(players(3), zeroRandom);
    const prior = session.currentMatchup!;
    session = { ...session, queueIndex: session.queue.length, previousMatchup: prior };
    const next = selectNextMatchup(session, zeroRandom);
    expect(pairKey(next.currentMatchup!)).not.toBe(pairKey(prior));
  });

  it("avoids reusing either prior player after reshuffling when two alternatives exist", () => {
    let session = initializeBrowserSession(players(6), zeroRandom);
    const prior = session.currentMatchup!;
    session = { ...session, queueIndex: session.queue.length, previousMatchup: prior };
    const next = selectNextMatchup(session, zeroRandom);
    const priorIds = new Set(Object.values(prior));
    expect(Object.values(next.currentMatchup!).every((id) => !priorIds.has(id))).toBe(true);
  });
});

describe("browser voting and rankings", () => {
  it("choosing Player A updates the correct two players", () => {
    const session = initializeBrowserSession(players(4), zeroRandom);
    const { playerAId, playerBId } = session.currentMatchup!;
    const result = applyBrowserVote(session, playerAId, zeroRandom).session;
    expect(result.ratings[playerAId]).toMatchObject({ wins: 1, comparisons: 1 });
    expect(result.ratings[playerBId]).toMatchObject({ losses: 1, comparisons: 1 });
  });

  it("choosing Player B updates the correct two players", () => {
    const session = initializeBrowserSession(players(4), zeroRandom);
    const { playerAId, playerBId } = session.currentMatchup!;
    const result = applyBrowserVote(session, playerBId, zeroRandom).session;
    expect(result.ratings[playerBId]).toMatchObject({ wins: 1, comparisons: 1 });
    expect(result.ratings[playerAId]).toMatchObject({ losses: 1, comparisons: 1 });
  });

  it("uses the existing Elo engine for winner and loser changes", () => {
    const session = initializeBrowserSession(players(4), zeroRandom);
    const { playerAId } = session.currentMatchup!;
    const { session: result } = applyBrowserVote(session, playerAId, zeroRandom);
    const expected = calculateNewRatings(1500, 1500);
    expect(result.ratings[playerAId].elo).toBe(expected.winnerElo);
    const loserId = session.currentMatchup!.playerBId;
    expect(result.ratings[loserId].elo).toBe(expected.loserElo);
  });

  it("updates wins and losses independently", () => {
    const session = initializeBrowserSession(players(4), zeroRandom);
    const { playerAId, playerBId } = session.currentMatchup!;
    const result = applyBrowserVote(session, playerAId, zeroRandom).session;
    expect(result.ratings[playerAId].wins).toBe(1);
    expect(result.ratings[playerBId].losses).toBe(1);
  });

  it("updates both comparison counts", () => {
    const session = initializeBrowserSession(players(4), zeroRandom);
    const { playerAId, playerBId } = session.currentMatchup!;
    const result = applyBrowserVote(session, playerAId, zeroRandom).session;
    expect(result.ratings[playerAId].comparisons).toBe(1);
    expect(result.ratings[playerBId].comparisons).toBe(1);
  });

  it("marks untouched players as unranked", () => {
    const session = initializeBrowserSession(players(4), zeroRandom);
    expect(isPlayerUnranked(session, "a")).toBe(true);
    expect(getComparedRank(session, "a")).toBeNull();
  });

  it("excludes untouched players from the Top 25", () => {
    const session = initializeBrowserSession(players(4), zeroRandom);
    expect(buildTop25(session)).toEqual([]);
  });

  it("places compared players in the Top 25", () => {
    const session = initializeBrowserSession(players(4), zeroRandom);
    const result = applyBrowserVote(session, session.currentMatchup!.playerAId, zeroRandom).session;
    expect(buildTop25(result)).toHaveLength(2);
  });

  it("uses the existing deterministic ranking tie-breakers", () => {
    const session = initializeBrowserSession(players(4), zeroRandom);
    session.ratings.a = { playerId: "a", elo: 1500, wins: 1, losses: 1, comparisons: 2 };
    session.ratings.b = { playerId: "b", elo: 1500, wins: 2, losses: 0, comparisons: 2 };
    session.ratings.c = { playerId: "c", elo: 1510, wins: 0, losses: 1, comparisons: 1 };
    expect(rankComparedPlayers(session).map((entry) => entry.player.id)).toEqual(["c", "b", "a"]);
  });

  it("returns fewer than 25 entries when fewer players have been compared", () => {
    const session = initializeBrowserSession(players(4), zeroRandom);
    const result = applyBrowserVote(session, session.currentMatchup!.playerAId, zeroRandom).session;
    expect(buildTop25(result)).toHaveLength(2);
  });
});
