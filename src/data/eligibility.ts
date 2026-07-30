import type { StaticPlayer } from "./types.js";

/** Phase 2A intentionally uses only observed playing time, not manual lists. */
export function isEligible(player: StaticPlayer): boolean {
  const required = Boolean(player.id && player.name && player.teamId && player.teamName && player.teamAbbreviation);
  return required && ((player.currentSeason.minutes ?? 0) > 0 || (player.previousSeason?.minutes ?? 0) > 0);
}
