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

export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
