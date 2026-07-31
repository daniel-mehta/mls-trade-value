import type { ComparisonPoolPlayer } from "../src/data/comparisonPool.js";

export function poolPlayer(
  id: string,
  overrides: Partial<ComparisonPoolPlayer> = {},
): ComparisonPoolPlayer {
  return {
    id,
    name: `Player ${id.toUpperCase()}`,
    teamId: `team-${id}`,
    teamName: `Team ${id.toUpperCase()}`,
    teamAbbreviation: id.toUpperCase(),
    positionGroup: "MID",
    position: "AM",
    currentSeason: { season: 2026, minutes: 100, goals: 1, assists: 2 },
    selectionReasons: ["manual-inclusion"],
    ...overrides,
  };
}

export function zeroRandom(): number {
  return 0;
}
