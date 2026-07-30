import type { Player, PlayerRating, Ratings } from "./types.js";

export const DEFAULT_INITIAL_RATING = 1500;
export const DEFAULT_K_FACTOR = 32;

/**
 * Elo converts the rating gap into the probability that player A wins. A
 * 400-point advantage corresponds to ten-to-one odds in this standard model.
 */
export function calculateExpectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
}

export interface RatingUpdate {
  winnerElo: number;
  loserElo: number;
}

/**
 * Both updates use the same expected score relationship. Since the two
 * expected scores sum to one, every Elo point gained by the winner is lost by
 * the loser, preserving the total rating across a matchup.
 */
export function calculateNewRatings(
  winnerRating: number,
  loserRating: number,
  kFactor = DEFAULT_K_FACTOR,
): RatingUpdate {
  const expectedWinner = calculateExpectedScore(winnerRating, loserRating);
  const winnerChange = kFactor * (1 - expectedWinner);

  return {
    winnerElo: winnerRating + winnerChange,
    loserElo: loserRating - winnerChange,
  };
}

export function initializeRatings(
  players: readonly Player[],
  initialRating = DEFAULT_INITIAL_RATING,
): Ratings {
  return Object.fromEntries(
    players.map((player) => [
      player.id,
      { playerId: player.id, elo: initialRating, wins: 0, losses: 0, comparisons: 0 },
    ]),
  );
}

/**
 * Returns a new rating map and new entries for the participants. This keeps
 * callers' current state safe for React/state-history use later without
 * coupling this pure domain code to either of those concerns.
 */
export function applyVote(
  ratings: Ratings,
  winnerId: string,
  loserId: string,
  kFactor = DEFAULT_K_FACTOR,
): Ratings {
  if (winnerId === loserId) {
    throw new Error("A player cannot be compared against themselves.");
  }

  const winner = ratings[winnerId];
  const loser = ratings[loserId];
  if (!winner) {
    throw new Error(`Unknown winner player ID: ${winnerId}`);
  }
  if (!loser) {
    throw new Error(`Unknown loser player ID: ${loserId}`);
  }

  const { winnerElo, loserElo } = calculateNewRatings(winner.elo, loser.elo, kFactor);
  return {
    ...ratings,
    [winnerId]: {
      ...winner,
      elo: winnerElo,
      wins: winner.wins + 1,
      comparisons: winner.comparisons + 1,
    },
    [loserId]: {
      ...loser,
      elo: loserElo,
      losses: loser.losses + 1,
      comparisons: loser.comparisons + 1,
    },
  };
}
