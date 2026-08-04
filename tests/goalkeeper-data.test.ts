import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { asaEndpointUrl, fetchAsa, type AsaRow } from "../src/data/asaClient.js";
import {
  attachGoalkeeperMetrics,
  goalkeeperSourceAudit,
  normalizeGoalkeeperSeason,
} from "../src/data/goalkeeper.js";
import { canonicalStringify } from "../src/data/semanticVersion.js";
import { staticPlayer } from "./data-fixtures.js";

const temporaryDirectories: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

function xGoals(playerId: string, teamId: string, season: number, changes: AsaRow = {}): AsaRow {
  return {
    player_id: playerId,
    team_id: teamId,
    season_name: String(season),
    minutes_played: 90,
    shots_faced: 5,
    goals_conceded: 2,
    saves: 3,
    share_headed_shots: 0.2,
    xgoals_gk_faced: 2.5,
    goals_minus_xgoals_gk: -0.5,
    goals_divided_by_xgoals_gk: 0.8,
    ...changes,
  };
}

function goalsAdded(playerId: string, teamId: string, season: number, raw = 0.25): AsaRow {
  return {
    player_id: playerId,
    team_id: teamId,
    season_name: String(season),
    minutes_played: 90,
    data: [
      { action_type: "Passing", goals_added_raw: raw, goals_added_above_avg: raw / 2, count_actions: 10 },
      { action_type: "Shotstopping", goals_added_raw: 0.5, goals_added_above_avg: 0.4, count_actions: 5 },
    ],
  };
}

describe("official ASA goalkeeper acquisition", () => {
  it("constructs the official current- and previous-season endpoint paths", () => {
    expect(asaEndpointUrl("goalkeeper-xgoals", 2026)).toBe("https://app.americansocceranalysis.com/api/v1/mls/goalkeepers/xgoals?season_name=2026&split_by_seasons=true&split_by_teams=true");
    expect(asaEndpointUrl("goalkeeper-goals-added", 2025)).toBe("https://app.americansocceranalysis.com/api/v1/mls/goalkeepers/goals-added?season_name=2025&split_by_seasons=true&split_by_teams=true");
  });

  it("uses an existing goalkeeper cache without a network request or invented retrieval time", async () => {
    const root = await mkdtemp(join(tmpdir(), "mls-goalkeeper-cache-"));
    temporaryDirectories.push(root);
    await mkdir(join(root, ".cache", "asa"), { recursive: true });
    await writeFile(join(root, ".cache", "asa", "goalkeeper-xgoals-2026.json"), JSON.stringify([xGoals("gk", "t", 2026)]));
    vi.spyOn(process, "cwd").mockReturnValue(root);
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const result = await fetchAsa("goalkeeper-xgoals", 2026);
    expect(result.fromCache).toBe(true);
    expect(result.retrievedAt).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("bypasses an existing goalkeeper cache only when refresh is explicit", async () => {
    const root = await mkdtemp(join(tmpdir(), "mls-goalkeeper-refresh-"));
    temporaryDirectories.push(root);
    await mkdir(join(root, ".cache", "asa"), { recursive: true });
    await writeFile(join(root, ".cache", "asa", "goalkeeper-xgoals-2026.json"), JSON.stringify([xGoals("cached", "t", 2026)]));
    vi.spyOn(process, "cwd").mockReturnValue(root);
    const fetcher = vi.fn(async () => new Response(JSON.stringify([xGoals("fresh", "t", 2026)]), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetcher);
    expect((await fetchAsa("goalkeeper-xgoals", 2026)).rows[0].player_id).toBe("cached");
    expect(fetcher).not.toHaveBeenCalled();
    expect((await fetchAsa("goalkeeper-xgoals", 2026, true)).rows[0].player_id).toBe("fresh");
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("distinguishes a legitimate empty response from an unavailable endpoint", async () => {
    const root = await mkdtemp(join(tmpdir(), "mls-goalkeeper-fetch-"));
    temporaryDirectories.push(root);
    vi.spyOn(process, "cwd").mockReturnValue(root);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } })));
    expect((await fetchAsa("goalkeeper-xgoals", 2026)).rows).toEqual([]);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("unavailable", { status: 503 })));
    await expect(fetchAsa("goalkeeper-goals-added", 2026, true)).rejects.toThrow("request failed (503");
  });

  it("fails clearly when a goalkeeper response is malformed", async () => {
    const root = await mkdtemp(join(tmpdir(), "mls-goalkeeper-malformed-"));
    temporaryDirectories.push(root);
    vi.spyOn(process, "cwd").mockReturnValue(root);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ unexpected: true }), { status: 200 })));
    await expect(fetchAsa("goalkeeper-xgoals", 2026)).rejects.toThrow("not an array");
  });
});

describe("goalkeeper source normalization", () => {
  it("joins by ASA player ID, keeps seasons separate, and attaches nothing to outfield players", () => {
    const current = normalizeGoalkeeperSeason(2026, [xGoals("gk", "a", 2026)], [goalsAdded("gk", "a", 2026)]);
    const previous = normalizeGoalkeeperSeason(2025, [xGoals("gk", "a", 2025)], [goalsAdded("gk", "a", 2025)]);
    const players = [
      staticPlayer("gk", { positionGroup: "GK" }),
      staticPlayer("outfield"),
    ];
    attachGoalkeeperMetrics(players, current, previous);
    expect(players[0].goalkeeperMetrics?.currentSeason?.season).toBe(2026);
    expect(players[0].goalkeeperMetrics?.previousSeason?.season).toBe(2025);
    expect(players[1].goalkeeperMetrics).toBeUndefined();
  });

  it("aggregates additive multi-team totals and raw Goals Added components without summing rates", () => {
    const normalized = normalizeGoalkeeperSeason(2026, [
      xGoals("gk", "a", 2026),
      xGoals("gk", "b", 2026, { shots_faced: 7, goals_conceded: 3, saves: 4, xgoals_gk_faced: 3.25, goals_minus_xgoals_gk: -0.25, share_headed_shots: 0.8, goals_divided_by_xgoals_gk: 0.9 }),
    ], [goalsAdded("gk", "a", 2026, 0.25), goalsAdded("gk", "b", 2026, -0.1)]);
    expect(normalized.metricsByPlayer.get("gk")).toEqual({
      season: 2026,
      shotsFaced: 12,
      goalsConceded: 5,
      saves: 7,
      xGoalsFaced: 5.75,
      goalsMinusXGoalsFaced: -0.75,
      goalsAdded: 1.15,
      goalsAddedByAction: { passing: 0.15, shotstopping: 1 },
    });
    expect(normalized.metricsByPlayer.get("gk")).not.toHaveProperty("shareHeadedShots");
    expect(normalized.metricsByPlayer.get("gk")).not.toHaveProperty("goalsDividedByXGoals");
  });

  it("is independent of source-row order and reports exact duplicate rows", () => {
    const xg = [xGoals("gk", "a", 2026), xGoals("gk", "b", 2026)];
    const gplus = [goalsAdded("gk", "a", 2026), goalsAdded("gk", "b", 2026)];
    const first = normalizeGoalkeeperSeason(2026, xg, gplus);
    const second = normalizeGoalkeeperSeason(2026, [...xg].reverse(), [...gplus].reverse());
    expect(canonicalStringify([...first.metricsByPlayer])).toBe(canonicalStringify([...second.metricsByPlayer]));
    const duplicate = normalizeGoalkeeperSeason(2026, [xg[0], structuredClone(xg[0])], [gplus[0]]);
    expect(duplicate.xGoals.duplicateRows).toBe(1);
  });

  it("omits metric objects when neither source supplies a performance value", () => {
    const identityOnly = { player_id: "gk", team_id: "t", season_name: "2026", minutes_played: 90 };
    const normalized = normalizeGoalkeeperSeason(2026, [identityOnly], [{ ...identityOnly, data: [] }]);
    expect(normalized.metricsByPlayer.has("gk")).toBe(false);
  });

  it("reports unknown IDs and normalized non-goalkeeper conflicts", () => {
    const normalized = normalizeGoalkeeperSeason(2026, [xGoals("unknown", "a", 2026), xGoals("outfield", "b", 2026)], []);
    expect(goalkeeperSourceAudit(normalized.xGoals, [staticPlayer("outfield")])).toMatchObject({
      matchedGoalkeeperIds: 0,
      unmatchedPlayerIds: 1,
      nonGoalkeeperJoinConflicts: 1,
    });
  });

  it("rejects wrong seasons, malformed numeric values, conflicting duplicates, and unsupported actions", () => {
    expect(() => normalizeGoalkeeperSeason(2026, [xGoals("gk", "a", 2025)], [])).toThrow("season_name must be 2026");
    expect(() => normalizeGoalkeeperSeason(2026, [xGoals("gk", "a", 2026, { saves: "bad" })], [])).toThrow("invalid saves");
    expect(() => normalizeGoalkeeperSeason(2026, [xGoals("gk", "a", 2026), xGoals("gk", "a", 2026, { saves: 4 })], [])).toThrow("conflicting duplicate");
    const malformed = goalsAdded("gk", "a", 2026);
    (malformed.data as AsaRow[])[0].action_type = "Unknown";
    expect(() => normalizeGoalkeeperSeason(2026, [], [malformed])).toThrow("unsupported action_type");
  });
});
