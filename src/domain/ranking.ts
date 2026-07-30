import type { Player, RankedPlayer, Ratings } from "./types.js";

/**
 * The complete ranking retains untested players. Deterministic tie-breakers
 * make equal Elo records stable and useful before a later UI filters a top 25.
 */
export function rankPlayers(players: readonly Player[], ratings: Ratings): RankedPlayer[] {
  return players
    .map((player) => {
      const rating = ratings[player.id];
      if (!rating) {
        throw new Error(`Missing rating for player ID: ${player.id}`);
      }
      return { player, ...rating };
    })
    .sort(
      (a, b) =>
        b.elo - a.elo ||
        b.comparisons - a.comparisons ||
        b.wins - a.wins ||
        a.player.name.localeCompare(b.player.name),
    );
}
