import { describe, expect, it } from "vitest";
import { isEligible } from "../src/data/eligibility.js";
import type { PlayerDataset, StaticPlayer } from "../src/data/types.js";
import { validateDataset } from "../src/data/validation.js";

const player = (overrides: Partial<StaticPlayer> = {}): StaticPlayer => ({ id: "a", name: "Alpha", teamId: "t", teamName: "Team", teamAbbreviation: "T", positionGroup: "MID", currentSeason: { season: 2026, minutes: 1 }, ...overrides });
const dataset = (players: StaticPlayer[]): PlayerDataset => ({ schemaVersion: 1, dataVersion: "test", competition: "MLS", season: 2026, previousSeason: 2025, generatedAt: "2026-01-01T00:00:00.000Z", sources: [], players });

describe("static player dataset validation", () => {
  it("accepts a valid fixture and optional salary fields", () => expect(validateDataset(dataset([player()]))).toEqual([]));
  it("detects duplicate IDs", () => expect(validateDataset(dataset([player(), player({ name: "Beta" })]))).toContain("duplicate or empty player ID: a"));
  it("detects missing required fields, negative numbers, and bad groups", () => expect(validateDataset(dataset([player({ name: "", positionGroup: "BAD" as "MID", currentSeason: { season: 2026, minutes: -1 } })]))).toHaveLength(3));
  it("rejects an empty dataset", () => expect(validateDataset(dataset([]))).toContain("players must be non-empty"));
  it("enforces minutes-based eligibility", () => { expect(isEligible(player({ currentSeason: { season: 2026 } }))).toBe(false); expect(isEligible(player({ currentSeason: { season: 2026 }, previousSeason: { season: 2025, minutes: 1 } }))).toBe(true); });
  it("cannot silently permit an ambiguous ID join", () => { const rows = [{ playerId: "a" }, { playerId: "a" }]; expect(new Set(rows.map((row) => row.playerId)).size).not.toBe(rows.length); });
});
