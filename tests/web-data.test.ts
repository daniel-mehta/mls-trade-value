import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { loadComparisonPool, PoolDataError, validateBrowserPool } from "../src/web/data.js";
import { mapPoolPlayersToEloPlayers } from "../src/web/session.js";
import { poolPlayer } from "./web-fixtures.js";

const validPool = (players: ReturnType<typeof poolPlayer>[]) => ({
  schemaVersion: 1,
  dataVersion: "test-pool",
  sourceDataVersion: "test-source",
  season: 2026,
  previousSeason: 2025,
  generatedAt: "2026-07-31T00:00:00.000Z",
  selectionRules: {
    baseOutfieldPlayersPerTeam: 5,
    baseGoalkeepersPerTeam: 1,
    previousSeasonMinutesWeight: 0.5,
    currentSeasonGoalContributionThreshold: 5,
  },
  players,
});

describe("browser comparison-pool loading", () => {
  it("loads the committed static comparison pool", async () => {
    const raw = await readFile("public/data/comparison-pool.json", "utf8");
    const pool = validateBrowserPool(JSON.parse(raw));
    expect(pool.players).toHaveLength(303);
    expect(pool.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("requests comparison-pool.json from the configured static base", async () => {
    const body = validPool([poolPlayer("a"), poolPlayer("b")]);
    const fetcher = vi.fn(async () => new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    const pool = await loadComparisonPool(fetcher, "/project/");
    expect(fetcher).toHaveBeenCalledWith("/project/data/comparison-pool.json");
    expect(pool.players.map((player) => player.id)).toEqual(["a", "b"]);
  });

  it("maps one Elo player per unique pool player", () => {
    expect(mapPoolPlayersToEloPlayers([poolPlayer("a"), poolPlayer("b")])).toHaveLength(2);
  });

  it("uses stable ASA player IDs without deriving keys from names", () => {
    const mapped = mapPoolPlayersToEloPlayers([
      poolPlayer("asa-123", { name: "Same Name" }),
      poolPlayer("asa-456", { name: "Same Name" }),
    ]);
    expect(mapped.map((player) => player.id)).toEqual(["asa-123", "asa-456"]);
  });

  it("rejects duplicate player IDs", () => {
    expect(() => validateBrowserPool(validPool([poolPlayer("a"), poolPlayer("a")]))).toThrow(
      "Duplicate ASA player ID: a",
    );
  });

  it("rejects an empty player pool with a distinct error state", () => {
    expect(() => validateBrowserPool(validPool([]))).toThrow(
      expect.objectContaining<Partial<PoolDataError>>({ reason: "empty" }),
    );
  });

  it("rejects a pool with fewer than two players", () => {
    expect(() => validateBrowserPool(validPool([poolPlayer("a")]))).toThrow(
      expect.objectContaining<Partial<PoolDataError>>({ reason: "too-small" }),
    );
  });

  it("rejects invalid required player data", () => {
    expect(() => validateBrowserPool(validPool([poolPlayer("a"), { ...poolPlayer("b"), name: "" }]))).toThrow(
      "missing a required field",
    );
  });
});
