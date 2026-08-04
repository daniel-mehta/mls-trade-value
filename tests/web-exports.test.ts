// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_INITIAL_RATING, DEFAULT_K_FACTOR } from "../src/domain/elo.js";
import { formatRankingCsv } from "../src/web/exports/csv.js";
import { downloadBrowserFile } from "../src/web/exports/download.js";
import { exportPersonalRanking } from "../src/web/exports/exporter.js";
import { rankingExportFilename } from "../src/web/exports/filename.js";
import { formatRankingJson } from "../src/web/exports/json.js";
import { createRankingExportModel } from "../src/web/exports/model.js";
import { formatTop25Text } from "../src/web/exports/text.js";
import { renderApp } from "../src/web/render.js";
import { applyBrowserVote, initializeBrowserSession } from "../src/web/session.js";
import { poolPlayer, testPoolProvenance, zeroRandom } from "./web-fixtures.js";

const clock = new Date("2026-08-03T20:00:00.000Z");

function rankedSession() {
  const session = initializeBrowserSession([
    poolPlayer("a", { name: "Álvaro, \"Ace\"\nLine", teamAbbreviation: undefined, position: undefined }),
    poolPlayer("b", { name: "Béatrice", teamName: "Club, North" }),
    poolPlayer("c"),
  ], zeroRandom);
  session.ratings.a = { playerId: "a", elo: 1578.424, wins: 4, losses: 1, comparisons: 5 };
  session.ratings.b = { playerId: "b", elo: 1564.1, wins: 3, losses: 1, comparisons: 4 };
  session.ratings.c = { playerId: "c", elo: 1500, wins: 0, losses: 0, comparisons: 0 };
  session.completedComparisons = 5;
  session.skippedMatchups = 2;
  return session;
}

function model() {
  return createRankingExportModel({
    session: rankedSession(),
    metadata: { dataVersion: "comparison-pool-v1", generatedAt: "not-a-timestamp", provenance: testPoolProvenance },
    product: "MLS Trade Value Elo",
    now: clock,
  });
}

describe("shared ranking export model", () => {
  it("uses deterministic existing ranking order, excludes unranked players, and does not mutate state", () => {
    const session = rankedSession();
    const before = structuredClone(session);
    const result = createRankingExportModel({ session, metadata: { dataVersion: "pool-v1", generatedAt: "2026-08-01T00:00:00.000Z", provenance: testPoolProvenance }, product: "MLS Trade Value Elo", now: clock });
    expect(result.rankedPlayers.map((player) => player.playerId)).toEqual(["a", "b"]);
    expect(result.rankedPlayers.map((player) => player.rank)).toEqual([1, 2]);
    expect(result.summary).toEqual({ rankedPlayers: 2, unrankedPlayers: 1, completedComparisons: 5, skippedComparisons: 2 });
    expect(result.dataset).toEqual({
      sourcePlayerDataVersion: testPoolProvenance.sourcePlayerDataVersion,
      comparisonPoolDataVersion: "pool-v1",
      playerArtifactBuiltAt: "2026-07-30T18:51:17.821Z",
      comparisonPoolArtifactBuiltAt: "2026-08-01T00:00:00.000Z",
      statisticsThrough: null,
      rosterSnapshotDate: "2026-02-26",
      rosterReleaseDate: "2026-02-27",
      salaryReleaseDate: "2026-04-16",
      salaryCurrency: "USD",
    });
    expect(result.elo).toEqual({ initialRating: DEFAULT_INITIAL_RATING, kFactor: DEFAULT_K_FACTOR });
    expect(session).toEqual(before);
  });

  it("fails rather than silently exporting a malformed ranked record", () => {
    const session = rankedSession();
    session.ratings.a.elo = Number.NaN;
    expect(() => createRankingExportModel({ session, metadata: { dataVersion: "pool-v1", provenance: testPoolProvenance }, product: "MLS Trade Value Elo", now: clock })).toThrow(/Elo value is invalid/);
  });
});

describe("ranking export formatters", () => {
  it("creates UTF-8 BOM CSV with the required schema, RFC-style escaping, and CRLF", () => {
    const csv = formatRankingCsv(model());
    expect(csv.startsWith("\uFEFFRank,ASA Player ID,Player,Team Abbreviation,Team,Position Group,Detailed Position,Elo,Wins,Losses,Comparisons\r\n")).toBe(true);
    expect(csv).toContain('"Álvaro, ""Ace""\nLine"');
    expect(csv).toContain('"Club, North"');
    expect(csv).toContain(",,Team A,MID,,1578.42,4,1,5");
    expect(csv).toContain("Béatrice");
    expect(csv).not.toContain("Player C");
    expect(csv).not.toContain("undefined");
    expect(csv).not.toContain("null");
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("creates a readable Top 25 text file from only ranked players", () => {
    const text = formatTop25Text(model());
    expect(text).toContain("My MLS Trade Value Elo Top 25");
    expect(text).toContain("Exported: August 3, 2026");
    expect(text).toContain("Source player version:");
    expect(text).toContain("Comparison-pool version: comparison-pool-v1");
    expect(text).toContain("Verified statistics through: not recorded");
    expect(text).toContain("Roster snapshot: February 26, 2026");
    expect(text).toContain("Salary release: April 16, 2026 (USD)");
    expect(text).not.toContain("contentSha256");
    expect(text).toContain("Completed comparisons: 5");
    expect(text).toContain("Skipped comparisons: 2");
    expect(text).toContain("1. Álvaro, \"Ace\"");
    expect(text).not.toContain('"Ace"\nLine');
    expect(text).toContain("1578.42 Elo | 4-1, 5 comparisons");
    expect(text).not.toContain("Player C");
    expect(text.endsWith("\n")).toBe(true);
  });

  it("creates pretty, explicit machine-readable JSON without persisted browser state", () => {
    const json = formatRankingJson(model());
    const parsed = JSON.parse(json);
    expect(parsed.exportFormatVersion).toBe(2);
    expect(parsed.rankedPlayers).toHaveLength(2);
    expect(parsed.summary.unrankedPlayers).toBe(1);
    expect(parsed.rankedPlayers[0].elo).toBe(1578.42);
    expect(json).toContain('\n  "dataset":');
    expect(json).not.toContain("schemaVersion");
    expect(json).not.toContain("localStorage");
    expect(json).not.toContain("rosterProfile");
    expect(json.endsWith("\n")).toBe(true);
  });
});

describe("export filenames and browser download", () => {
  it("uses safe deterministic UTC filenames", () => {
    expect(rankingExportFilename("csv", clock)).toBe("mls-trade-value-ranking-2026-08-03.csv");
    expect(rankingExportFilename("text", clock)).toBe("mls-trade-value-top-25-2026-08-03.txt");
    expect(rankingExportFilename("json", clock)).toBe("mls-trade-value-ranking-2026-08-03.json");
  });

  it("creates, clicks, cleans up, and revokes every object URL", () => {
    let createdBlob: Blob | undefined;
    const createObjectURL = vi.fn((blob: Blob) => { createdBlob = blob; return "blob:test"; });
    const revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const result = downloadBrowserFile("value", "ranking.csv", "text/csv;charset=utf-8", { document, Blob, URL: { createObjectURL, revokeObjectURL } });
    expect(result).toEqual({ kind: "success" });
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(createdBlob).toBeInstanceOf(Blob);
    expect(createdBlob?.type).toBe("text/csv;charset=utf-8");
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:test");
    expect(document.querySelectorAll('a[download="ranking.csv"]')).toHaveLength(0);
    click.mockRestore();
  });

  it("returns a structured failure when URL creation fails without leaving an anchor", () => {
    const result = downloadBrowserFile("value", "ranking.csv", "text/csv", {
      document, Blob, URL: { createObjectURL: () => { throw new Error("blocked"); }, revokeObjectURL: vi.fn() },
    });
    expect(result.kind).toBe("failure");
    if (result.kind === "failure") expect(result.reason).toBe("create");
    expect(document.querySelectorAll('a[download="ranking.csv"]')).toHaveLength(0);
  });

  it("refuses an empty ranking without touching browser storage or network APIs", () => {
    const session = initializeBrowserSession([poolPlayer("a"), poolPlayer("b")], zeroRandom);
    const before = structuredClone(session);
    const fetcher = vi.spyOn(globalThis, "fetch");
    const storageWrite = vi.spyOn(Storage.prototype, "setItem");
    const result = exportPersonalRanking("csv", session, { dataVersion: "pool-v1", provenance: testPoolProvenance }, clock);
    expect(result.kind).toBe("failure");
    expect(session).toEqual(before);
    expect(fetcher).not.toHaveBeenCalled();
    expect(storageWrite).not.toHaveBeenCalled();
    fetcher.mockRestore();
    storageWrite.mockRestore();
  });
});

describe("export controls", () => {
  const idle = { kind: "idle", message: "Ready" } as const;

  it("renders a normal-flow disabled export footer until a comparison is completed", () => {
    const root = document.createElement("div");
    const session = initializeBrowserSession([poolPlayer("a"), poolPlayer("b")], zeroRandom);
    renderApp(root, { session, status: idle }, { onChoose: vi.fn(), onSkip: vi.fn(), onExport: vi.fn() });
    const footer = root.querySelector(".ranking-export");
    const list = root.querySelector(".ranking-list");
    expect(footer).not.toBeNull();
    expect(footer?.closest(".ranking-list")).toBeNull();
    expect(footer?.closest(".ranking-header")).toBeNull();
    expect([...root.querySelectorAll<HTMLButtonElement>(".button--export")].every((button) => button.disabled)).toBe(true);
    expect(root.textContent).toContain("Complete at least one comparison to export your ranking.");
    expect(list).toBeNull();
  });

  it("enables each keyboard-accessible exporter after a completed comparison", () => {
    const root = document.createElement("div");
    const initial = initializeBrowserSession([poolPlayer("a"), poolPlayer("b")], zeroRandom);
    const session = applyBrowserVote(initial, initial.currentMatchup!.playerAId, zeroRandom).session;
    const onExport = vi.fn();
    renderApp(root, { session, status: idle }, { onChoose: vi.fn(), onSkip: vi.fn(), onExport });
    const buttons = [...root.querySelectorAll<HTMLButtonElement>(".button--export")];
    expect(buttons.every((button) => !button.disabled)).toBe(true);
    expect(root.querySelector(".ranking-header .button--quiet")?.textContent).toBe("Reset ranking");
    expect(root.querySelector(".ranking-list")?.compareDocumentPosition(root.querySelector(".ranking-export")!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    buttons[0].dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    buttons[0].click();
    buttons[1].click();
    buttons[2].click();
    expect(onExport).toHaveBeenCalledWith("csv");
    expect(onExport).toHaveBeenCalledWith("text");
    expect(onExport).toHaveBeenCalledWith("json");
  });
});
