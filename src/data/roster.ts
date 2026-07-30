import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { PlayerRosterProfile, StaticPlayer } from "./types.js";

const ROOT = "https://api.github.com/repos/American-Soccer-Analysis/mls-roster-profiles/contents/data/json";
const RAW = "https://raw.githubusercontent.com/American-Soccer-Analysis/mls-roster-profiles/main/data/json/";
type Raw = Record<string, unknown>;
export interface RosterRelease { release_date: string; teams: Array<{ id?: unknown; name?: unknown; roster_construction_model?: unknown; players?: Raw[] }> }

function date(value: unknown): string | undefined { return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) ? value : undefined; }
function str(value: unknown): string | undefined { return typeof value === "string" && value.trim() ? value.trim() : undefined; }
function bool(value: unknown): boolean | undefined { return typeof value === "boolean" ? value : undefined; }
/** Keep only explicit four-digit years; source strings such as PT: 2029 are reported. */
export function normalizeOptionYears(value: unknown, unrecognized: Set<string> = new Set()): string[] | undefined {
  const text = str(value); if (!text) return undefined;
  const years = [...text.matchAll(/\b(\d{4})\b/g)].map((m) => m[1]);
  if (!years.length) { unrecognized.add(text); return undefined; }
  return [...new Set(years)];
}
export function deriveActive(slot: string | undefined, unavailable: boolean | undefined): boolean { return unavailable !== true && slot !== "Off-Roster (Unavailable)"; }
function assertRelease(value: unknown): RosterRelease {
  if (!value || typeof value !== "object" || !date((value as Raw).release_date) || !Array.isArray((value as Raw).teams)) throw new Error("Invalid ASA roster release: expected release_date and teams");
  return value as RosterRelease;
}
/** JSON contains ASA IDs already, so no PDF parsing or name matching is needed. */
export async function fetchLatestRoster(forceRefresh = false): Promise<{ release: RosterRelease; fromCache: boolean; available: string[] }> {
  const dir = join(process.cwd(), ".cache", "rosters"); const indexPath = join(dir, "releases.json");
  let files: Array<{ name: string; download_url?: string }>;
  if (!forceRefresh) { try { files = JSON.parse(await readFile(indexPath, "utf8")); } catch { files = []; } } else files = [];
  if (!files.length) { const r = await fetch(ROOT, { headers: { Accept: "application/json" } }); if (!r.ok) throw new Error(`Roster release listing failed (${r.status})`); files = await r.json() as typeof files; await mkdir(dir, { recursive: true }); await writeFile(indexPath, JSON.stringify(files)); }
  const available = files.map((f) => f.name).filter((n) => /^2026-\d\d-\d\d\.json$/.test(n)).map((n) => n.slice(0, 10)).sort();
  if (!available.length) throw new Error(`No valid 2026 roster releases; available files: ${files.map((f) => f.name).join(", ")}`);
  // Filename locates candidates only. The embedded release_date determines final selection.
  const candidates: Array<{ release: RosterRelease; cached: boolean }> = [];
  for (const name of available) { const path = join(dir, `${name}.json`); let body: unknown; let cached = false; try { if (forceRefresh) throw new Error("refresh"); body = JSON.parse(await readFile(path, "utf8")); cached = true; } catch { const r = await fetch(`${RAW}${name}.json`); if (!r.ok) throw new Error(`Roster release ${name} failed (${r.status})`); body = await r.json(); await mkdir(dir, { recursive: true }); await writeFile(path, JSON.stringify(body, null, 2)); } candidates.push({ release: assertRelease(body), cached }); }
  candidates.sort((a,b) => b.release.release_date.localeCompare(a.release.release_date)); return { release: candidates[0].release, fromCache: candidates[0].cached, available };
}
export function attachRoster(players: StaticPlayer[], release: RosterRelease): { unmatched: number; disagreements: number; optionFormats: string[]; total: number; duplicates: number; missingIds: number } {
  const byId = new Map(players.map((p) => [p.id, p])); const seen = new Map<string, string>(); const formats = new Set<string>(); let unmatched = 0, disagreements = 0, total = 0, duplicates = 0, missingIds = 0;
  for (const team of release.teams) for (const raw of team.players ?? []) { total++; const id = str(raw.id), teamId = str(team.id), teamName = str(team.name); if (!id || !teamId || !teamName) { unmatched++; if (!id) missingIds++; continue; }
    const fingerprint = JSON.stringify(raw); const player = byId.get(id);
    // A roster-only player has no normalized target; report it, but do not let
    // duplicate lending/receiving entries prevent the statistical build.
    if (!player) { unmatched++; continue; }
    if (seen.has(id)) {
      duplicates++;
      // The published 2026 snapshot contains a documented loan pair (the same
      // ASA ID at lending and receiving clubs). It is not a response-order tie:
      // retain the profile whose snapshot team matches the statistical team.
      const loanPair = (/Loan Player/.test(String(raw.current_status ?? "")) || seen.get(id)!.includes("Loan Player")) && player;
      if (!loanPair) { if (seen.get(id) !== fingerprint) throw new Error(`Conflicting duplicate roster player ID: ${id}`); continue; }
      if (player!.teamId !== teamId) continue;
    }
    seen.set(id, fingerprint);
    const optionYears = normalizeOptionYears(raw.option_years, formats); const slot = str(raw.roster_slot); const unavailable = bool(raw.unavailable);
    player.rosterProfile = { snapshotDate: release.release_date, listedInRosterSnapshot: true, activeAtRosterSnapshot: deriveActive(slot, unavailable), snapshotTeamId: teamId, snapshotTeamName: teamName, ...(slot ? { rosterSlot: slot } : {}), ...(str(raw.roster_designation) ? { rosterDesignation: str(raw.roster_designation) } : {}), ...(str(raw.current_status) ? { currentStatus: str(raw.current_status) } : {}), ...(str(raw.contract_through) ? { contractThrough: str(raw.contract_through) } : {}), ...(optionYears ? { optionYears } : {}), ...(bool(raw.permanent_transfer_option) !== undefined ? { permanentTransferOption: bool(raw.permanent_transfer_option) } : {}), ...(bool(raw.international_slot) !== undefined ? { internationalSlot: bool(raw.international_slot) } : {}), ...(bool(raw.convertible_with_tam) !== undefined ? { convertibleWithTam: bool(raw.convertible_with_tam) } : {}), ...(unavailable !== undefined ? { unavailable } : {}), ...(bool(raw.canadian_international_slot_exemption) !== undefined ? { canadianInternationalSlotExemption: bool(raw.canadian_international_slot_exemption) } : {}), ...(str(team.roster_construction_model) ? { rosterConstructionModel: str(team.roster_construction_model) } : {}) };
    if (player.teamId !== teamId) disagreements++;
  } return { unmatched, disagreements, optionFormats: [...formats].sort(), total, duplicates, missingIds };
}
