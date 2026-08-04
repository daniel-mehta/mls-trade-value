import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchAsa } from "../src/data/asaClient.js";
import { computePlayerDataVersion, sha256CanonicalRows } from "../src/data/semanticVersion.js";
import { validateDataset } from "../src/data/validation.js";
import { playerDataset, staticPlayer } from "./data-fixtures.js";

const temporaryDirectories: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("structured source provenance", () => {
  it("hashes source rows deterministically", () => {
    expect(sha256CanonicalRows([{ b: 2, a: 1 }, { id: "x" }])).toBe(sha256CanonicalRows([{ id: "x" }, { a: 1, b: 2 }]));
  });

  it("represents an old cache without inventing a retrieval time", async () => {
    const root = await mkdtemp(join(tmpdir(), "mls-provenance-"));
    temporaryDirectories.push(root);
    await mkdir(join(root, ".cache", "asa"), { recursive: true });
    await writeFile(join(root, ".cache", "asa", "players-all.json"), JSON.stringify([{ player_id: "a" }]));
    vi.spyOn(process, "cwd").mockReturnValue(root);
    const result = await fetchAsa("players");
    expect(result.fromCache).toBe(true);
    expect(result.retrievedAt).toBeNull();
    expect(result.contentSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("accepts available salary metadata", () => {
    const dataset = playerDataset([staticPlayer()]);
    dataset.salary = { status: "available", selectedSeason: 2026, selectedRelease: "2026-04-16", currency: "USD", selectedRecordCount: 1 };
    dataset.dataVersion = computePlayerDataVersion(dataset);
    expect(validateDataset(dataset)).toEqual([]);
  });

  it("accepts explicit optional-unavailable salary sources", () => {
    const dataset = playerDataset([staticPlayer()]);
    for (const source of dataset.sources.filter((entry) => entry.sourceId.startsWith("asa-salaries-"))) {
      source.status = "optional-unavailable";
      source.contentSha256 = null;
      source.rowCount = 0;
    }
    dataset.audit.sourceRowCounts = Object.fromEntries(dataset.sources.map((source) => [source.sourceId, source.rowCount]));
    dataset.salary = { status: "optional-unavailable", selectedSeason: null, selectedRelease: null, currency: "USD", selectedRecordCount: 0 };
    dataset.dataVersion = computePlayerDataVersion(dataset);
    expect(validateDataset(dataset)).toEqual([]);
  });

  it("keeps roster file, file date, and embedded snapshot date distinct", () => {
    const dataset = playerDataset([staticPlayer()]);
    expect(dataset.rosterSnapshot).toMatchObject({
      releaseFilename: "2026-02-27.json",
      fileDate: "2026-02-27",
      snapshotDate: "2026-02-26",
    });
    expect(dataset.statisticsThrough).toBeNull();
  });
});
