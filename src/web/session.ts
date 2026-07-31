import type { ComparisonPoolPlayer } from "../data/comparisonPool.js";
import { applyVote as applyEloVote, initializeRatings } from "../domain/elo.js";
import { rankPlayers } from "../domain/ranking.js";
import type { Player, RankedPlayer, Ratings } from "../domain/types.js";

export interface Matchup {
  playerAId: string;
  playerBId: string;
}

export interface BrowserSession {
  players: ComparisonPoolPlayer[];
  eloPlayers: Player[];
  ratings: Ratings;
  queue: string[];
  queueIndex: number;
  currentMatchup: Matchup | null;
  previousMatchup: Matchup | null;
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

export type RandomSource = () => number;

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

export function shufflePlayerIds(
  ids: readonly string[],
  random: RandomSource = Math.random,
): string[] {
  const shuffled = [...ids];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

export function pairKey(matchup: Matchup): string {
  return [matchup.playerAId, matchup.playerBId].sort().join(":");
}

function prepareReshuffledQueue(
  ids: readonly string[],
  previous: Matchup | null,
  random: RandomSource,
): string[] {
  const queue = shufflePlayerIds(ids, random);
  if (!previous) return queue;

  const previousIds = new Set([previous.playerAId, previous.playerBId]);
  if (queue.length >= 4) {
    const alternatives = queue
      .map((id, index) => ({ id, index }))
      .filter(({ id }) => !previousIds.has(id));
    if (alternatives.length >= 2) {
      const firstId = alternatives[0].id;
      const secondId = alternatives[1].id;
      const firstIndex = queue.indexOf(firstId);
      [queue[0], queue[firstIndex]] = [queue[firstIndex], queue[0]];
      const secondIndex = queue.indexOf(secondId);
      [queue[1], queue[secondIndex]] = [queue[secondIndex], queue[1]];
    }
  }

  const candidate = { playerAId: queue[0], playerBId: queue[1] };
  if (pairKey(candidate) === pairKey(previous) && queue.length > 2) {
    const replacementIndex = queue.findIndex(
      (id, index) => index > 1 && id !== queue[0] && pairKey({ playerAId: queue[0], playerBId: id }) !== pairKey(previous),
    );
    if (replacementIndex >= 0) {
      [queue[1], queue[replacementIndex]] = [queue[replacementIndex], queue[1]];
    }
  }
  return queue;
}

export function selectNextMatchup(
  session: BrowserSession,
  random: RandomSource = Math.random,
): BrowserSession {
  let queue = session.queue;
  let queueIndex = session.queueIndex;
  if (queueIndex + 1 >= queue.length) {
    queue = prepareReshuffledQueue(
      session.eloPlayers.map((player) => player.id),
      session.previousMatchup,
      random,
    );
    queueIndex = 0;
  }
  const currentMatchup = {
    playerAId: queue[queueIndex],
    playerBId: queue[queueIndex + 1],
  };
  if (currentMatchup.playerAId === currentMatchup.playerBId) {
    throw new Error("A player cannot be matched against themselves.");
  }
  return { ...session, queue, queueIndex: queueIndex + 2, currentMatchup };
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
    queue: shufflePlayerIds(eloPlayers.map((player) => player.id), random),
    queueIndex: 0,
    currentMatchup: null,
    previousMatchup: null,
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
  return selectNextMatchup(
    { ...session, ...changes, previousMatchup, currentMatchup: null },
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
