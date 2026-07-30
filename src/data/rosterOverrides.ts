import { readFile } from "node:fs/promises";
import type { PlayerRosterProfile, StaticPlayer } from "./types.js";

export interface RosterOverride { playerId: string; effectiveDate: string; reason: string; sourceNote: string; fields: Partial<Pick<PlayerRosterProfile, "snapshotTeamId" | "snapshotTeamName" | "listedInRosterSnapshot" | "activeAtRosterSnapshot" | "rosterSlot" | "rosterDesignation" | "currentStatus" | "contractThrough" | "optionYears" | "permanentTransferOption" | "internationalSlot" | "convertibleWithTam" | "unavailable" | "canadianInternationalSlotExemption" | "rosterConstructionModel">> & { teamId?: string }; }
const KEYS = new Set(["teamId", "snapshotTeamId", "snapshotTeamName", "listedInRosterSnapshot", "activeAtRosterSnapshot", "rosterSlot", "rosterDesignation", "currentStatus", "contractThrough", "optionYears", "permanentTransferOption", "internationalSlot", "convertibleWithTam", "unavailable", "canadianInternationalSlotExemption", "rosterConstructionModel"]);
const BOOLEANS = new Set(["listedInRosterSnapshot", "activeAtRosterSnapshot", "permanentTransferOption", "internationalSlot", "convertibleWithTam", "unavailable", "canadianInternationalSlotExemption"]);
const TEXT = new Set(["snapshotTeamId", "snapshotTeamName", "rosterSlot", "rosterDesignation", "currentStatus", "contractThrough", "rosterConstructionModel"]);
const validDate = (value: unknown) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
const nonEmpty = (value: unknown) => typeof value === "string" && value.trim().length > 0;

/** Overrides are deliberately narrow corrections to normalized output only. */
export function validateOverrides(value: unknown, players: StaticPlayer[], teamIds: Set<string>): RosterOverride[] {
  if (!value || typeof value !== "object" || (value as Record<string, unknown>).schemaVersion !== 1 || !Array.isArray((value as Record<string, unknown>).overrides)) throw new Error("Invalid roster override file: expected schemaVersion 1 and overrides array");
  const knownPlayers = new Set(players.map((p) => p.id)); const seen = new Set<string>();
  return (value as { overrides: unknown[] }).overrides.map((raw, index) => {
    const bad = (message: string): never => { throw new Error(`Invalid roster override ${index + 1}: ${message}`); };
    if (!raw || typeof raw !== "object") bad("must be an object"); const o = raw as Record<string, unknown>;
    if (!nonEmpty(o.playerId)) bad("unknown or missing playerId"); const playerId = o.playerId as string;
    if (!knownPlayers.has(playerId)) bad("unknown or missing playerId"); if (seen.has(playerId)) bad("duplicate playerId"); seen.add(playerId);
    if (!validDate(o.effectiveDate)) bad("invalid effectiveDate"); if (!nonEmpty(o.reason)) bad("empty reason"); if (!nonEmpty(o.sourceNote)) bad("empty sourceNote");
    if (!o.fields || typeof o.fields !== "object" || Array.isArray(o.fields) || !Object.keys(o.fields as object).length) bad("empty fields"); const fields = o.fields as Record<string, unknown>;
    for (const [key, field] of Object.entries(fields)) { if (!KEYS.has(key)) bad(`unsupported field ${key}`); if (BOOLEANS.has(key) && typeof field !== "boolean") bad(`invalid boolean ${key}`); if (TEXT.has(key) && !nonEmpty(field)) bad(`invalid text ${key}`); if (key === "teamId" && (!nonEmpty(field) || !teamIds.has(field as string))) bad("unknown teamId"); if (key === "optionYears" && (!Array.isArray(field) || !field.length || field.some((year) => typeof year !== "string" || !/^\d{4}$/.test(year)) || new Set(field).size !== field.length)) bad("invalid optionYears"); }
    return o as unknown as RosterOverride;
  });
}
export async function loadOverrides(path: string, players: StaticPlayer[], teamIds: Set<string>): Promise<RosterOverride[]> { return validateOverrides(JSON.parse(await readFile(path, "utf8")), players, teamIds); }
export function applyOverrides(players: StaticPlayer[], overrides: RosterOverride[]): number {
  for (const override of overrides) { const player = players.find((p) => p.id === override.playerId)!; const { teamId, ...profileFields } = override.fields; if (teamId) player.teamId = teamId; if (!player.rosterProfile) throw new Error(`Override ${override.playerId} cannot create a roster profile`); Object.assign(player.rosterProfile, profileFields); }
  return overrides.length;
}
