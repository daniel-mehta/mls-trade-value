import { describe, expect, it } from "vitest";
import { deriveActive, normalizeOptionYears } from "../src/data/roster.js";
import { applyOverrides, validateOverrides } from "../src/data/rosterOverrides.js";
describe("roster normalization", () => {
  it("normalizes observed option-year strings without inventing years", () => expect(normalizeOptionYears("2027, 2028")).toEqual(["2027", "2028"]));
  it("omits empty option years", () => expect(normalizeOptionYears("")).toBeUndefined());
  it("reports unknown option-year format", () => { const unknown = new Set<string>(); normalizeOptionYears("none", unknown); expect([...unknown]).toEqual(["none"]); });
  it("keeps unavailable players inactive", () => expect(deriveActive("Senior Roster", true)).toBe(false));
  it("keeps off-roster players inactive", () => expect(deriveActive("Off-Roster (Unavailable)", false)).toBe(false));
});
describe("roster overrides", () => {
  const players = [{ id: "p1", teamId: "t1", rosterProfile: { snapshotDate:"2026-02-26", listedInRosterSnapshot:true, activeAtRosterSnapshot:true, snapshotTeamId:"t1", snapshotTeamName:"One" } }] as any[];
  const valid = { playerId:"p1", effectiveDate:"2026-03-01", reason:"Correction", sourceNote:"Club release", fields:{ rosterSlot:"Senior Roster" } };
  it("accepts the empty override file", () => expect(validateOverrides({schemaVersion:1,overrides:[]}, players, new Set(["t1"]))).toEqual([]));
  it("applies a valid override after roster data without mutating its source object", () => { const copy=structuredClone(players); const list=validateOverrides({schemaVersion:1,overrides:[valid]}, copy,new Set(["t1"])); applyOverrides(copy,list); expect(copy[0].rosterProfile.rosterSlot).toBe("Senior Roster"); expect(players[0].rosterProfile.rosterSlot).toBeUndefined(); });
  for (const [name, value] of [["duplicate", {schemaVersion:1,overrides:[valid,valid]}],["unknown", {schemaVersion:1,overrides:[{...valid,playerId:"no"}]}],["empty reason", {schemaVersion:1,overrides:[{...valid,reason:""}]}],["empty source", {schemaVersion:1,overrides:[{...valid,sourceNote:""}]}],["bad date", {schemaVersion:1,overrides:[{...valid,effectiveDate:"no"}]}],["empty fields", {schemaVersion:1,overrides:[{...valid,fields:{}}]}],["unsupported", {schemaVersion:1,overrides:[{...valid,fields:{wat:1}}]}],["bad years", {schemaVersion:1,overrides:[{...valid,fields:{optionYears:["no"]}}]}],["unknown team", {schemaVersion:1,overrides:[{...valid,fields:{teamId:"no"}}]}]]) it(`rejects ${name}`, () => expect(()=>validateOverrides(value,players,new Set(["t1"]))).toThrow());
});
