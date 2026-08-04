import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { sha256CanonicalUnordered } from "./semanticVersion.js";
import { CURRENT_SEASON, type PlayerRosterProfile, type StaticPlayer } from "./types.js";

export const ROSTER_REPOSITORY = "https://github.com/American-Soccer-Analysis/mls-roster-profiles";
const ROOT = "https://api.github.com/repos/American-Soccer-Analysis/mls-roster-profiles/contents/data/json";
const RAW = "https://raw.githubusercontent.com/American-Soccer-Analysis/mls-roster-profiles/main/data/json/";
type Raw = Record<string, unknown>;

export interface RosterRelease {
  release_date: string;
  teams: Array<{ id?: unknown; name?: unknown; roster_construction_model?: unknown; players?: Raw[] }>;
}

export interface RosterCandidate {
  filename: string;
  fileDate: string;
  release: RosterRelease;
  contentSha256: string;
  retrievedAt: string | null;
  cached: boolean;
}

function date(value: unknown): string | undefined {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value ? value : undefined;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function bool(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

/** Keep only explicit four-digit years; source strings such as PT: 2029 are reported. */
export function normalizeOptionYears(value: unknown, unrecognized: Set<string> = new Set()): string[] | undefined {
  const text = str(value);
  if (!text) return undefined;
  const years = [...text.matchAll(/\b(\d{4})\b/g)].map((match) => match[1]);
  if (!years.length) {
    unrecognized.add(text);
    return undefined;
  }
  return [...new Set(years)].sort();
}

export function deriveActive(slot: string | undefined, unavailable: boolean | undefined): boolean {
  return unavailable !== true && slot !== "Off-Roster (Unavailable)";
}

function assertRelease(value: unknown): RosterRelease {
  if (!value || typeof value !== "object" || !date((value as Raw).release_date) || !Array.isArray((value as Raw).teams)) {
    throw new Error("Invalid ASA roster release: expected a real release_date and teams array");
  }
  return value as RosterRelease;
}

function filenameDate(filename: string, targetSeason: number): string | undefined {
  const match = new RegExp(`^(${targetSeason}-\\d{2}-\\d{2})\\.json$`).exec(filename);
  return match ? date(match[1]) : undefined;
}

/** Embedded snapshot dates decide recency. Equal latest dates must have identical content. */
export function selectLatestRosterCandidate(candidates: readonly RosterCandidate[], targetSeason: number): RosterCandidate {
  if (!candidates.length) throw new Error(`No valid ${targetSeason} roster releases were available`);
  for (const candidate of candidates) {
    if (!filenameDate(candidate.filename, targetSeason) || candidate.fileDate !== candidate.filename.slice(0, 10)) {
      throw new Error(`Roster release filename is invalid for ${targetSeason}: ${candidate.filename}`);
    }
    if (!date(candidate.release.release_date) || !candidate.release.release_date.startsWith(`${targetSeason}-`)) {
      throw new Error(`Roster ${candidate.filename} has an invalid embedded date: ${candidate.release.release_date}`);
    }
    if (candidate.fileDate < candidate.release.release_date) {
      throw new Error(`Roster ${candidate.filename} predates its embedded snapshot ${candidate.release.release_date}`);
    }
  }
  const latestDate = [...candidates].map((candidate) => candidate.release.release_date).sort().at(-1)!;
  const latest = candidates.filter((candidate) => candidate.release.release_date === latestDate);
  if (new Set(latest.map((candidate) => candidate.contentSha256)).size > 1) {
    throw new Error(`Ambiguous roster releases share latest embedded date ${latestDate}: ${latest.map((candidate) => candidate.filename).sort().join(", ")}`);
  }
  return [...latest].sort((a, b) => a.filename < b.filename ? -1 : a.filename > b.filename ? 1 : 0)[0];
}

/** JSON contains ASA IDs for downstream joins; its upstream parser may still require source review. */
export async function fetchLatestRoster(
  forceRefresh = false,
  targetSeason = CURRENT_SEASON,
): Promise<RosterCandidate & { available: string[] }> {
  const dir = join(process.cwd(), ".cache", "rosters");
  const indexPath = join(dir, "releases.json");
  let files: Array<{ name: string; download_url?: string }>;
  if (!forceRefresh) {
    try { files = JSON.parse(await readFile(indexPath, "utf8")) as typeof files; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      files = [];
    }
  } else {
    files = [];
  }
  if (!files.length) {
    const response = await fetch(ROOT, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`Roster release listing failed (${response.status})`);
    files = await response.json() as typeof files;
    await mkdir(dir, { recursive: true });
    await writeFile(indexPath, JSON.stringify(files));
  }

  const filenames = files.map((file) => file.name).filter((name) => Boolean(filenameDate(name, targetSeason))).sort();
  if (!filenames.length) {
    throw new Error(`No valid ${targetSeason} roster releases; available files: ${files.map((file) => file.name).join(", ")}`);
  }
  const candidates: RosterCandidate[] = [];
  for (const filename of filenames) {
    const path = join(dir, filename);
    const metadataPath = join(dir, `${filename.slice(0, -5)}.meta.json`);
    let body: unknown;
    let cached = false;
    let retrievedAt: string | null = null;
    try {
      if (forceRefresh) throw new Error("refresh");
      body = JSON.parse(await readFile(path, "utf8"));
      cached = true;
    } catch (error) {
      if (!forceRefresh && (error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const response = await fetch(`${RAW}${filename}`);
      if (!response.ok) throw new Error(`Roster release ${filename} failed (${response.status})`);
      body = await response.json();
      retrievedAt = new Date().toISOString();
      await mkdir(dir, { recursive: true });
      await writeFile(path, JSON.stringify(body, null, 2));
    }
    const release = assertRelease(body);
    const contentSha256 = sha256CanonicalUnordered(release);
    if (cached) {
      try {
        const metadata = JSON.parse(await readFile(metadataPath, "utf8")) as Record<string, unknown>;
        if (metadata.contentSha256 === contentSha256 && typeof metadata.retrievedAt === "string" && Number.isFinite(Date.parse(metadata.retrievedAt))) {
          retrievedAt = new Date(metadata.retrievedAt).toISOString();
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    } else {
      await writeFile(metadataPath, `${JSON.stringify({ retrievedAt, contentSha256 }, null, 2)}\n`);
    }
    candidates.push({
      filename,
      fileDate: filename.slice(0, 10),
      release,
      contentSha256,
      retrievedAt,
      cached,
    });
  }
  return { ...selectLatestRosterCandidate(candidates, targetSeason), available: filenames };
}

interface RosterEntry {
  id: string;
  teamId: string;
  teamName: string;
  teamConstructionModel?: string;
  raw: Raw;
}

function profileFromEntry(entry: RosterEntry, snapshotDate: string, formats: Set<string>): PlayerRosterProfile {
  const raw = entry.raw;
  const optionYears = normalizeOptionYears(raw.option_years, formats);
  const slot = str(raw.roster_slot);
  const unavailable = bool(raw.unavailable);
  return {
    snapshotDate,
    listedInRosterSnapshot: true,
    activeAtRosterSnapshot: deriveActive(slot, unavailable),
    snapshotTeamId: entry.teamId,
    snapshotTeamName: entry.teamName,
    ...(slot ? { rosterSlot: slot } : {}),
    ...(str(raw.roster_designation) ? { rosterDesignation: str(raw.roster_designation) } : {}),
    ...(str(raw.current_status) ? { currentStatus: str(raw.current_status) } : {}),
    ...(str(raw.contract_through) ? { contractThrough: str(raw.contract_through) } : {}),
    ...(optionYears ? { optionYears } : {}),
    ...(bool(raw.permanent_transfer_option) !== undefined ? { permanentTransferOption: bool(raw.permanent_transfer_option) } : {}),
    ...(bool(raw.international_slot) !== undefined ? { internationalSlot: bool(raw.international_slot) } : {}),
    ...(bool(raw.convertible_with_tam) !== undefined ? { convertibleWithTam: bool(raw.convertible_with_tam) } : {}),
    ...(unavailable !== undefined ? { unavailable } : {}),
    ...(bool(raw.canadian_international_slot_exemption) !== undefined ? { canadianInternationalSlotExemption: bool(raw.canadian_international_slot_exemption) } : {}),
    ...(entry.teamConstructionModel ? { rosterConstructionModel: entry.teamConstructionModel } : {}),
  };
}

export function attachRoster(players: StaticPlayer[], release: RosterRelease): {
  unmatched: number;
  disagreements: number;
  optionFormats: string[];
  total: number;
  duplicates: number;
  missingIds: number;
} {
  const byId = new Map(players.map((player) => [player.id, player]));
  const grouped = new Map<string, RosterEntry[]>();
  const formats = new Set<string>();
  let unmatched = 0;
  let total = 0;
  let duplicates = 0;
  let missingIds = 0;

  for (const team of release.teams) {
    const teamId = str(team.id);
    const teamName = str(team.name);
    const teamConstructionModel = str(team.roster_construction_model);
    for (const raw of team.players ?? []) {
      total++;
      const id = str(raw.id);
      if (!id || !teamId || !teamName) {
        unmatched++;
        if (!id) missingIds++;
        continue;
      }
      if (!byId.has(id)) {
        unmatched++;
        continue;
      }
      const entry = { id, teamId, teamName, teamConstructionModel, raw };
      (grouped.get(id) ?? grouped.set(id, []).get(id)!).push(entry);
    }
  }

  for (const [id, entries] of grouped) {
    const player = byId.get(id)!;
    let selected: RosterEntry;
    if (entries.length === 1) {
      selected = entries[0];
    } else {
      duplicates += entries.length - 1;
      const loanPair = entries.every((entry) => /loan/i.test(String(entry.raw.current_status ?? ""))) &&
        entries.some((entry) => /Loan Player/.test(String(entry.raw.current_status ?? "")));
      const matchingTeam = entries.filter((entry) => entry.teamId === player.teamId);
      if (!loanPair || matchingTeam.length !== 1) {
        throw new Error(`Cannot deterministically resolve duplicate roster player ID: ${id}`);
      }
      selected = matchingTeam[0];
    }
    player.rosterProfile = profileFromEntry(selected, release.release_date, formats);
  }

  const disagreements = players.filter((player) => player.rosterProfile && player.teamId !== player.rosterProfile.snapshotTeamId).length;
  return { unmatched, disagreements, optionFormats: [...formats].sort(), total, duplicates, missingIds };
}
