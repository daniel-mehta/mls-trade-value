import type { ComparisonPoolPlayer } from "../data/comparisonPool.js";
import { applyVote as applyEloVote, initializeRatings } from "../domain/elo.js";
import { rankPlayers } from "../domain/ranking.js";
import type { Player, RankedPlayer, Ratings } from "../domain/types.js";
import { appendMatchupHistory } from "./scheduler/history.js";
import { matchupPairKey } from "./scheduler/pair.js";
import { selectNextMatchup as selectScheduledMatchup } from "./scheduler/select.js";
import type { Matchup, RandomSource } from "./scheduler/types.js";

export type { Matchup, RandomSource } from "./scheduler/types.js";

export interface BrowserSession {
  players: ComparisonPoolPlayer[];
  eloPlayers: Player[];
  ratings: Ratings;
  currentMatchup: Matchup | null;
  previousMatchup: Matchup | null;
  recentPairs: string[];
  recentPlayers: string[];
  completedComparisons: number;
  skippedMatchups: number;
}

export interface VoteResult {
  winnerId: string;
  loserId: string;
  winnerBefore: number;
  winnerAfter: number;
  loserBefore: number;
  loserAfter: number;
}

export function mapPoolPlayersToEloPlayers(
  players: readonly ComparisonPoolPlayer[],
): Player[] {
  const ids = new Set<string>();
  return players.map((player) => {
    if (!player.id || ids.has(player.id)) {
      throw new Error(`Duplicate or missing ASA player ID: ${player.id || "missing"}`);
    }
    ids.add(player.id);
    return {
      id: player.id,
      name: player.name,
      team: player.teamAbbreviation,
      position: player.positionGroup,
    };
  });
}

/** Compatibility helper for callers that only need an unordered pair key. */
export function pairKey(matchup: Matchup): string {
  return matchupPairKey(matchup);
}

export function selectNextMatchup(
  session: BrowserSession,
  random: RandomSource = Math.random,
): BrowserSession {
  const result = selectScheduledMatchup({
    players: session.players,
    ratings: session.ratings,
    completedComparisons: session.completedComparisons,
    recentPlayers: session.recentPlayers,
    recentPairs: session.recentPairs,
    previousPair: session.previousMatchup,
    random,
  });
  if (result.kind === "insufficient-pool") {
    throw new Error("At least two eligible players are required.");
  }
  return { ...session, currentMatchup: result.matchup };
}

export function initializeBrowserSession(
  sourcePlayers: readonly ComparisonPoolPlayer[],
  random: RandomSource = Math.random,
): BrowserSession {
  if (sourcePlayers.length < 2) {
    throw new Error("At least two eligible players are required.");
  }
  const players = structuredClone([...sourcePlayers]);
  const eloPlayers = mapPoolPlayersToEloPlayers(players);
  const base: BrowserSession = {
    players,
    eloPlayers,
    ratings: initializeRatings(eloPlayers),
    currentMatchup: null,
    previousMatchup: null,
    recentPairs: [],
    recentPlayers: [],
    completedComparisons: 0,
    skippedMatchups: 0,
  };
  return selectNextMatchup(base, random);
}

function advance(
  session: BrowserSession,
  changes: Partial<BrowserSession>,
  random: RandomSource,
): BrowserSession {
  const previousMatchup = session.currentMatchup;
  if (!previousMatchup) throw new Error("The browser session has no current matchup.");
  const history = appendMatchupHistory(session.recentPairs, session.recentPlayers, previousMatchup);
  return selectNextMatchup(
    {
      ...session,
      ...changes,
      ...history,
      previousMatchup,
      currentMatchup: null,
    },
    random,
  );
}

export function applyBrowserVote(
  session: BrowserSession,
  winnerId: string,
  random: RandomSource = Math.random,
): { session: BrowserSession; result: VoteResult } {
  const matchup = session.currentMatchup;
  if (!matchup || ![matchup.playerAId, matchup.playerBId].includes(winnerId)) {
    throw new Error("The winner must be a player in the current matchup.");
  }
  const loserId = winnerId === matchup.playerAId ? matchup.playerBId : matchup.playerAId;
  const winnerBefore = session.ratings[winnerId].elo;
  const loserBefore = session.ratings[loserId].elo;
  const ratings = applyEloVote(session.ratings, winnerId, loserId);
  return {
    session: advance(
      session,
      { ratings, completedComparisons: session.completedComparisons + 1 },
      random,
    ),
    result: {
      winnerId,
      loserId,
      winnerBefore,
      winnerAfter: ratings[winnerId].elo,
      loserBefore,
      loserAfter: ratings[loserId].elo,
    },
  };
}

export function applySkip(
  session: BrowserSession,
  random: RandomSource = Math.random,
): BrowserSession {
  return advance(
    session,
    { skippedMatchups: session.skippedMatchups + 1 },
    random,
  );
}

export function rankComparedPlayers(session: BrowserSession): RankedPlayer[] {
  return rankPlayers(session.eloPlayers, session.ratings).filter(
    (entry) => entry.comparisons > 0,
  );
}

export function buildTop25(session: BrowserSession): RankedPlayer[] {
  return rankComparedPlayers(session).slice(0, 25);
}

export function isPlayerUnranked(session: BrowserSession, playerId: string): boolean {
  const rating = session.ratings[playerId];
  if (!rating) throw new Error(`Unknown player ID: ${playerId}`);
  return rating.comparisons === 0;
}

export function getComparedRank(session: BrowserSession, playerId: string): number | null {
  const index = rankComparedPlayers(session).findIndex((entry) => entry.player.id === playerId);
  return index < 0 ? null : index + 1;
}
