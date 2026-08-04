import { describe, expect, it } from "vitest";
import { isEligible } from "../src/data/eligibility.js";
import { computePlayerDataVersion } from "../src/data/semanticVersion.js";
import { validateDataset } from "../src/data/validation.js";
import { playerDataset, staticPlayer } from "./data-fixtures.js";

describe("static player dataset validation", () => {
  it("accepts a fully versioned fixture", () => expect(validateDataset(playerDataset([staticPlayer()]))).toEqual([]));

  it("rejects empty versions, invalid timestamps, competition, seasons, and sources", () => {
    const cases = [
      ["dataVersion", "dataVersion must be a SHA-256 semantic version", (dataset: any) => { dataset.dataVersion = ""; }],
      ["generatedAt", "generatedAt must be a canonical ISO timestamp", (dataset: any) => { dataset.generatedAt = "yesterday"; }],
      ["competition", "competition must be MLS", (dataset: any) => { dataset.competition = "WRONG"; }],
      ["season", "previousSeason must immediately precede season", (dataset: any) => { dataset.previousSeason = 2020; }],
      ["sources", "sources must be non-empty", (dataset: any) => { dataset.sources = []; }],
    ] as const;
    for (const [, message, mutate] of cases) {
      const dataset = playerDataset([staticPlayer()]);
      mutate(dataset);
      expect(validateDataset(dataset)).toContain(message);
    }
  });

  it("rejects invalid checksums and impossible roster totals", () => {
    const checksum = playerDataset([staticPlayer()]);
    checksum.sources[0].contentSha256 = "bad";
    expect(validateDataset(checksum).join("\n")).toContain("requires a SHA-256 checksum");
    const totals = playerDataset([staticPlayer()]);
    totals.rosterSnapshot.rawRecordCount = 4;
    expect(validateDataset(totals)).toContain("roster record totals do not reconcile");
  });

  it("rejects unknown artifact and player record keys", () => {
    const artifact = playerDataset([staticPlayer()]) as any;
    artifact.extra = true;
    expect(validateDataset(artifact).join("\n")).toContain("dataset contains unsupported keys");
    const record = playerDataset([staticPlayer()]) as any;
    record.players[0].extra = true;
    expect(validateDataset(record).join("\n")).toContain("contains unsupported keys");
  });

  it("detects duplicate player IDs and inconsistent team tuples", () => {
    const duplicate = playerDataset([staticPlayer("a"), staticPlayer("a", { name: "Player b" })]);
    expect(validateDataset(duplicate).join("\n")).toContain("duplicate or empty player ID");
    const teams = playerDataset([
      staticPlayer("a"),
      staticPlayer("b", { teamName: "Different", teamAbbreviation: "D" }),
    ]);
    expect(validateDataset(teams).join("\n")).toContain("team ID maps to inconsistent name or abbreviation");
  });

  it("detects missing identity, negative numbers, and invalid groups", () => {
    const dataset = playerDataset([staticPlayer("a", {
      name: "",
      positionGroup: "BAD" as "MID",
      currentSeason: { season: 2026, minutes: -1 },
    })]);
    const errors = validateDataset(dataset).join("\n");
    expect(errors).toContain("missing name");
    expect(errors).toContain("invalid position group");
    expect(errors).toContain("invalid minutes");
  });

  it("rejects empty player records", () => expect(validateDataset(playerDataset([]))).toContain("players must be non-empty"));

  it("detects a stale semantic version after substantive mutation", () => {
    const dataset = playerDataset([staticPlayer()]);
    dataset.players[0].currentSeason.minutes = 99;
    expect(validateDataset(dataset).join("\n")).toContain("semantic dataVersion mismatch");
    dataset.dataVersion = computePlayerDataVersion(dataset);
    expect(validateDataset(dataset)).toEqual([]);
  });

  it("enforces normalized minutes-based eligibility", () => {
    expect(isEligible(staticPlayer("a", { currentSeason: { season: 2026 } }))).toBe(false);
    expect(isEligible(staticPlayer("a", { currentSeason: { season: 2026 }, previousSeason: { season: 2025, minutes: 1 } }))).toBe(true);
  });
});
