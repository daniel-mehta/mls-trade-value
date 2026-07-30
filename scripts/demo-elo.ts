import { mockPlayers } from "../src/data/mockPlayers.js";
import { applyVote, initializeRatings } from "../src/domain/elo.js";
import { rankPlayers } from "../src/domain/ranking.js";

function printRankings(title: string, ratings: ReturnType<typeof initializeRatings>): void {
  console.log(`\n${title}`);
  rankPlayers(mockPlayers, ratings).forEach((entry, index) => {
    console.log(
      `${index + 1}. ${entry.player.name} | ${entry.elo.toFixed(2)} | ${entry.wins}-${entry.losses} | ${entry.comparisons} comparisons`,
    );
  });
}

let ratings = initializeRatings(mockPlayers);
printRankings("Initial rankings", ratings);

// Fixed votes make this manual smoke test repeatable across runs.
const votes = [
  ["aria-bennett", "mateo-cardenas"],
  ["felix-estrada", "devon-cho"],
  ["aria-bennett", "imani-diallo"],
  ["jonah-kim", "lina-morales"],
  ["aria-bennett", "felix-estrada"],
] as const;

console.log("\nApplying votes");
for (const [winnerId, loserId] of votes) {
  const winner = mockPlayers.find((player) => player.id === winnerId);
  const loser = mockPlayers.find((player) => player.id === loserId);
  if (!winner || !loser) throw new Error("Demo vote references an unknown mock player.");
  ratings = applyVote(ratings, winnerId, loserId);
  console.log(`${winner.name} defeated ${loser.name}`);
}

printRankings("Final rankings", ratings);

// These checks exercise the outcome counts and the invariant that Elo stays balanced.
const totalElo = Object.values(ratings).reduce((sum, rating) => sum + rating.elo, 0);
const aria = ratings["aria-bennett"];
const totalComparisons = Object.values(ratings).reduce((sum, rating) => sum + rating.comparisons, 0);
if (aria.wins !== 3 || aria.losses !== 0 || totalComparisons !== votes.length * 2 || Math.abs(totalElo - mockPlayers.length * 1500) > 1e-9) {
  console.error("Manual Elo checks failed.");
  process.exitCode = 1;
} else {
  console.log("\nManual Elo checks passed.");
}
