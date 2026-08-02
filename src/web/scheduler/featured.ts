import type { ComparisonPoolPlayer } from "../../data/comparisonPool.js";
import { SCHEDULER_CONFIG } from "./config.js";

export interface FeaturedPriorityComponents {
  designatedPlayer: number;
  u22Initiative: number;
  currentSeasonGoalContributions: number;
  baseTeamSelection: number;
  highParticipation: number;
}

function hasReason(player: ComparisonPoolPlayer, reason: string): boolean {
  return player.selectionReasons.includes(reason as ComparisonPoolPlayer["selectionReasons"][number]);
}

/** Scheduler-only engagement context. This never enters Elo records or ranking order. */
export function featuredPriorityComponents(player: ComparisonPoolPlayer): FeaturedPriorityComponents {
  const designation = player.rosterProfile?.rosterDesignation;
  return {
    designatedPlayer: designation === "Designated Player" || hasReason(player, "designated-player") ? 3 : 0,
    u22Initiative: designation === "U22 Initiative" || hasReason(player, "u22-initiative") ? 2 : 0,
    currentSeasonGoalContributions:
      (player.currentSeason.goals ?? 0) + (player.currentSeason.assists ?? 0) >= 5 ? 2 : 0,
    baseTeamSelection:
      hasReason(player, "team-outfield-selection") || hasReason(player, "team-goalkeeper-selection") ? 1 : 0,
    highParticipation: (player.currentSeason.minutes ?? 0) >= SCHEDULER_CONFIG.highParticipationMinutes ? 1 : 0,
  };
}

export function calculateFeaturedPriority(player: ComparisonPoolPlayer): number {
  return Object.values(featuredPriorityComponents(player)).reduce((total, value) => total + value, 0);
}

export function isFeaturedPriorityPlayer(player: ComparisonPoolPlayer): boolean {
  return calculateFeaturedPriority(player) >= SCHEDULER_CONFIG.featuredScoreThreshold;
}

