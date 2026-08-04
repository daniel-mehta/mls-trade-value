import { readFile } from "node:fs/promises";
import type { PlayerRosterProfile, StaticPlayer } from "./types.js";

export interface TeamIdentity { name: string; abbreviation: string; }
export type TeamDirectory = ReadonlyMap<string, TeamIdentity>;

export interface RosterOverrideFields extends Partial<Pick<PlayerRosterProfile,
  "listedInRosterSnapshot" | "activeAtRosterSnapshot" | "rosterSlot" | "rosterDesignation" |
  "currentStatus" | "contractThrough" | "optionYears" | "permanentTransferOption" |
  "internationalSlot" | "convertibleWithTam" | "unavailable" |
  "canadianInternationalSlotExemption" | "rosterConstructionModel">> {
  teamId?: string;
  teamName?: string;
  teamAbbreviation?: string;
  snapshotTeamId?: string;
  snapshotTeamName?: string;
}

export interface RosterOverride {
  playerId: string;
  effectiveDate: string;
  reason: string;
  sourceNote: string;
  fields: RosterOverrideFields;
}

const TOP_LEVEL_KEYS = new Set(["schemaVersion", "overrides"]);
const ENTRY_KEYS = new Set(["playerId", "effectiveDate", "reason", "sourceNote", "fields"]);
const FIELD_KEYS = new Set([
  "teamId", "teamName", "teamAbbreviation", "snapshotTeamId", "snapshotTeamName",
  "listedInRosterSnapshot", "activeAtRosterSnapshot", "rosterSlot", "rosterDesignation",
  "currentStatus", "contractThrough", "optionYears", "permanentTransferOption",
  "internationalSlot", "convertibleWithTam", "unavailable",
  "canadianInternationalSlotExemption", "rosterConstructionModel",
]);
const BOOLEANS = new Set([
  "listedInRosterSnapshot", "activeAtRosterSnapshot", "permanentTransferOption",
  "internationalSlot", "convertibleWithTam", "unavailable", "canadianInternationalSlotExemption",
]);
const TEXT = new Set([
  "teamId", "teamName", "teamAbbreviation", "snapshotTeamId", "snapshotTeamName",
  "rosterSlot", "rosterDesignation", "currentStatus", "contractThrough", "rosterConstructionModel",
]);

function realDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function rejectUnknownKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>, label: string): void {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length) throw new Error(`${label} contains unsupported keys: ${unknown.sort().join(", ")}`);
}

/** Overrides are narrow, exact-schema corrections to normalized output only. */
export function validateOverrides(value: unknown, players: StaticPlayer[], teams: TeamDirectory): RosterOverride[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid roster override file: expected an object");
  const document = value as Record<string, unknown>;
  rejectUnknownKeys(document, TOP_LEVEL_KEYS, "Roster override file");
  if (document.schemaVersion !== 1 || !Array.isArray(document.overrides)) {
    throw new Error("Invalid roster override file: expected schemaVersion 1 and overrides array");
  }
  const knownPlayers = new Set(players.map((player) => player.id));
  const seen = new Set<string>();
  return document.overrides.map((raw, index) => {
    const bad = (message: string): never => { throw new Error(`Invalid roster override ${index + 1}: ${message}`); };
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) bad("must be an object");
    const entry = raw as Record<string, unknown>;
    try { rejectUnknownKeys(entry, ENTRY_KEYS, `Roster override ${index + 1}`); }
    catch (error) { return bad((error as Error).message); }
    if (!nonEmpty(entry.playerId) || !knownPlayers.has(entry.playerId)) bad("unknown or missing playerId");
    const playerId = entry.playerId as string;
    if (seen.has(playerId)) bad("duplicate playerId");
    seen.add(playerId);
    if (!realDate(entry.effectiveDate)) bad("invalid effectiveDate");
    if (!nonEmpty(entry.reason)) bad("empty reason");
    if (!nonEmpty(entry.sourceNote)) bad("empty sourceNote");
    if (!entry.fields || typeof entry.fields !== "object" || Array.isArray(entry.fields) || !Object.keys(entry.fields).length) bad("empty fields");
    const fields = entry.fields as Record<string, unknown>;
    for (const [key, field] of Object.entries(fields)) {
      if (!FIELD_KEYS.has(key)) bad(`unsupported field ${key}`);
      if (BOOLEANS.has(key) && typeof field !== "boolean") bad(`invalid boolean ${key}`);
      if (TEXT.has(key) && !nonEmpty(field)) bad(`invalid text ${key}`);
      if (key === "optionYears") {
        if (!Array.isArray(field) || !field.length || field.some((year) => !realDate(`${year}-01-01`)) || new Set(field).size !== field.length) bad("invalid optionYears");
      }
    }

    const statisticalTuple = ["teamId", "teamName", "teamAbbreviation"].filter((key) => fields[key] !== undefined);
    if (statisticalTuple.length !== 0 && statisticalTuple.length !== 3) bad("statistical team override requires teamId, teamName, and teamAbbreviation");
    if (statisticalTuple.length === 3) {
      const known = teams.get(fields.teamId as string);
      if (!known) return bad("unknown teamId");
      if (known.name !== fields.teamName || known.abbreviation !== fields.teamAbbreviation) bad("statistical team tuple does not match the known team");
    }

    const snapshotTuple = ["snapshotTeamId", "snapshotTeamName"].filter((key) => fields[key] !== undefined);
    if (snapshotTuple.length !== 0 && snapshotTuple.length !== 2) bad("snapshot team override requires snapshotTeamId and snapshotTeamName");
    if (snapshotTuple.length === 2) {
      const known = teams.get(fields.snapshotTeamId as string);
      if (!known) return bad("unknown snapshotTeamId");
      if (known.name !== fields.snapshotTeamName) bad("snapshot team tuple does not match the known team");
    }

    const normalizedFields = { ...fields } as RosterOverrideFields;
    if (normalizedFields.optionYears) normalizedFields.optionYears = [...normalizedFields.optionYears].sort();
    return {
      playerId,
      effectiveDate: entry.effectiveDate as string,
      reason: (entry.reason as string).trim(),
      sourceNote: (entry.sourceNote as string).trim(),
      fields: normalizedFields,
    };
  });
}

export async function loadOverrides(path: string, players: StaticPlayer[], teams: TeamDirectory): Promise<RosterOverride[]> {
  return validateOverrides(JSON.parse(await readFile(path, "utf8")), players, teams);
}

export function applyOverrides(players: StaticPlayer[], overrides: RosterOverride[]): number {
  for (const override of overrides) {
    const player = players.find((candidate) => candidate.id === override.playerId)!;
    const { teamId, teamName, teamAbbreviation, ...profileFields } = override.fields;
    if (teamId && teamName && teamAbbreviation) {
      player.teamId = teamId;
      player.teamName = teamName;
      player.teamAbbreviation = teamAbbreviation;
    }
    if (!player.rosterProfile) throw new Error(`Override ${override.playerId} cannot create a roster profile`);
    Object.assign(player.rosterProfile, profileFields);
  }
  return overrides.length;
}
