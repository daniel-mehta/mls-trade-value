import { describe, expect, it } from "vitest";
import { attachRoster, deriveActive, normalizeOptionYears, selectLatestRosterCandidate, type RosterCandidate } from "../src/data/roster.js";
import { applyOverrides, validateOverrides } from "../src/data/rosterOverrides.js";
import { staticPlayer } from "./data-fixtures.js";

describe("roster normalization", () => {
  it("normalizes observed option-year strings without inventing years", () => expect(normalizeOptionYears("2028, 2027")).toEqual(["2027", "2028"]));
  it("omits empty option years", () => expect(normalizeOptionYears("")).toBeUndefined());
  it("reports unknown option-year format", () => { const unknown = new Set<string>(); normalizeOptionYears("none", unknown); expect([...unknown]).toEqual(["none"]); });
  it("keeps unavailable and off-roster players inactive", () => {
    expect(deriveActive("Senior Roster", true)).toBe(false);
    expect(deriveActive("Off-Roster (Unavailable)", false)).toBe(false);
  });
});

describe("deterministic roster release selection", () => {
  const candidate = (filename: string, snapshotDate: string, hash = "a".repeat(64)): RosterCandidate => ({
    filename,
    fileDate: filename.slice(0, 10),
    release: { release_date: snapshotDate, teams: [] },
    contentSha256: hash,
    retrievedAt: null,
    cached: true,
  });

  it("selects an alternate configured season by latest embedded date", () => {
    const selected = selectLatestRosterCandidate([
      candidate("2027-02-28.json", "2027-02-27"),
      candidate("2027-05-02.json", "2027-05-01"),
    ], 2027);
    expect(selected.filename).toBe("2027-05-02.json");
  });

  it("fails for ambiguous distinct releases sharing the latest embedded date", () => {
    expect(() => selectLatestRosterCandidate([
      candidate("2027-05-02.json", "2027-05-01", "a".repeat(64)),
      candidate("2027-05-03.json", "2027-05-01", "b".repeat(64)),
    ], 2027)).toThrow(/Ambiguous roster releases/);
  });

  it("fails clearly for filename and embedded-date mismatches", () => {
    expect(() => selectLatestRosterCandidate([candidate("2027-02-27.json", "2027-02-28")], 2027)).toThrow(/predates its embedded snapshot/);
    expect(() => selectLatestRosterCandidate([candidate("2026-02-27.json", "2026-02-26")], 2027)).toThrow(/filename is invalid/);
  });
});

describe("deterministic loan-pair attachment", () => {
  it("selects the statistical-team record regardless of roster response order", () => {
    const player = staticPlayer("loan", { teamId: "t2", teamName: "Two", teamAbbreviation: "TWO" });
    const teams = [
      { id: "t1", name: "One", players: [{ id: "loan", current_status: "Unavailable - On Loan" }] },
      { id: "t2", name: "Two", players: [{ id: "loan", current_status: "Loan Player" }] },
    ];
    const first = [structuredClone(player)];
    const second = [structuredClone(player)];
    const firstAudit = attachRoster(first, { release_date: "2026-02-26", teams });
    const secondAudit = attachRoster(second, { release_date: "2026-02-26", teams: [...teams].reverse() });
    expect(first[0].rosterProfile).toEqual(second[0].rosterProfile);
    expect(first[0].rosterProfile?.snapshotTeamId).toBe("t2");
    expect(firstAudit).toMatchObject({ duplicates: 1, disagreements: 0 });
    expect(secondAudit).toMatchObject({ duplicates: 1, disagreements: 0 });
  });
});

describe("strict roster overrides", () => {
  const players = [staticPlayer("p1", {
    teamId: "t1",
    teamName: "One",
    teamAbbreviation: "ONE",
    rosterProfile: {
      snapshotDate: "2026-02-26",
      listedInRosterSnapshot: true,
      activeAtRosterSnapshot: true,
      snapshotTeamId: "t1",
      snapshotTeamName: "One",
    },
  })];
  const teams = new Map([
    ["t1", { name: "One", abbreviation: "ONE" }],
    ["t2", { name: "Two", abbreviation: "TWO" }],
  ]);
  const valid = { playerId: "p1", effectiveDate: "2026-03-01", reason: "Correction", sourceNote: "Club release", fields: { rosterSlot: "Senior Roster" } };

  it("accepts the empty override file", () => expect(validateOverrides({ schemaVersion: 1, overrides: [] }, players, teams)).toEqual([]));

  it("applies a complete team tuple and preserves omitted booleans", () => {
    const copy = structuredClone(players);
    const entry = { ...valid, fields: { teamId: "t2", teamName: "Two", teamAbbreviation: "TWO" } };
    applyOverrides(copy, validateOverrides({ schemaVersion: 1, overrides: [entry] }, copy, teams));
    expect(copy[0]).toMatchObject({ teamId: "t2", teamName: "Two", teamAbbreviation: "TWO" });
    expect(copy[0].rosterProfile?.unavailable).toBeUndefined();
  });

  it.each([
    ["extra top-level property", { schemaVersion: 1, overrides: [], extra: true }],
    ["extra entry property", { schemaVersion: 1, overrides: [{ ...valid, extra: true }] }],
    ["duplicate ID", { schemaVersion: 1, overrides: [valid, valid] }],
    ["unknown player", { schemaVersion: 1, overrides: [{ ...valid, playerId: "no" }] }],
    ["impossible date", { schemaVersion: 1, overrides: [{ ...valid, effectiveDate: "2026-02-30" }] }],
    ["blank reason", { schemaVersion: 1, overrides: [{ ...valid, reason: " " }] }],
    ["blank source", { schemaVersion: 1, overrides: [{ ...valid, sourceNote: " " }] }],
    ["empty fields", { schemaVersion: 1, overrides: [{ ...valid, fields: {} }] }],
    ["unsupported field", { schemaVersion: 1, overrides: [{ ...valid, fields: { wat: 1 } }] }],
    ["bad option years", { schemaVersion: 1, overrides: [{ ...valid, fields: { optionYears: ["no"] } }] }],
    ["invalid boolean", { schemaVersion: 1, overrides: [{ ...valid, fields: { unavailable: "no" } }] }],
    ["partial statistical tuple", { schemaVersion: 1, overrides: [{ ...valid, fields: { teamId: "t2" } }] }],
    ["unknown statistical team", { schemaVersion: 1, overrides: [{ ...valid, fields: { teamId: "no", teamName: "No", teamAbbreviation: "NO" } }] }],
    ["unknown snapshot team", { schemaVersion: 1, overrides: [{ ...valid, fields: { snapshotTeamId: "no", snapshotTeamName: "No" } }] }],
  ])("rejects %s", (_name, document) => expect(() => validateOverrides(document, players, teams)).toThrow());
});
