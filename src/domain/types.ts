/** A deliberately small player shape for the initial local ranking engine. */
export interface Player {
  id: string;
  name: string;
  team: string;
  position: string;
}

export interface PlayerRating {
  playerId: string;
  elo: number;
  wins: number;
  losses: number;
  comparisons: number;
}

export interface Vote {
  winnerId: string;
  loserId: string;
  createdAt: string;
}

/** Ratings are keyed by stable player ID to make vote updates inexpensive. */
export type Ratings = Record<string, PlayerRating>;

export interface RankedPlayer extends PlayerRating {
  player: Player;
}
