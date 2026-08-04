import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { sha256CanonicalRows } from "./semanticVersion.js";
import { COMPETITION } from "./types.js";

export const ASA_BASE_URL = "https://app.americansocceranalysis.com/api/v1";
export type AsaRow = Record<string, unknown>;
export type AsaDatasetName =
  | "players"
  | "teams"
  | "xgoals"
  | "xpass"
  | "goals-added"
  | "salaries"
  | "goalkeeper-xgoals"
  | "goalkeeper-goals-added";

export interface AsaFetchResult {
  rows: AsaRow[];
  fromCache: boolean;
  url: string;
  retrievedAt: string | null;
  contentSha256: string;
}

interface CacheMetadata { retrievedAt: string; contentSha256: string; }

function cachePath(name: AsaDatasetName, season?: number): string {
  return join(process.cwd(), ".cache", "asa", `${name}-${season ?? "all"}.json`);
}

function cacheMetadataPath(name: AsaDatasetName, season?: number): string {
  return join(process.cwd(), ".cache", "asa", `${name}-${season ?? "all"}.meta.json`);
}

function unwrapResponse(value: unknown): AsaRow[] {
  if (Array.isArray(value)) return value as AsaRow[];
  if (value && typeof value === "object") {
    const candidate = value as Record<string, unknown>;
    for (const key of ["data", "rows", "results"]) if (Array.isArray(candidate[key])) return candidate[key] as AsaRow[];
  }
  throw new Error("ASA response was not an array or an object containing data/rows/results");
}

/** Fetch directly from ASA rather than at browser runtime. Cache is intentionally
 * raw and ignored by git so a failed live service never masquerades as fresh data. */
export function asaEndpointUrl(name: AsaDatasetName, season?: number): string {
  const endpoint = name === "players" || name === "teams"
    ? name
    : name === "goalkeeper-xgoals"
      ? "goalkeepers/xgoals"
      : name === "goalkeeper-goals-added"
        ? "goalkeepers/goals-added"
        : `players/${name}`;
  const url = new URL(`${ASA_BASE_URL}/${COMPETITION}/${endpoint}`);
  if (season !== undefined) {
    url.searchParams.set("season_name", String(season));
    // Explicit groups make the expected player-team-season grain inspectable.
    if (name !== "players" && name !== "teams" && name !== "salaries") { url.searchParams.set("split_by_seasons", "true"); url.searchParams.set("split_by_teams", "true"); }
  }
  return url.toString();
}

/** Fetches or observes a source snapshot. Old caches intentionally report a
 * null retrieval time rather than borrowing the artifact build time. */
export async function fetchAsa(name: AsaDatasetName, season?: number, forceRefresh = false): Promise<AsaFetchResult> {
  const path = cachePath(name, season);
  const metadataPath = cacheMetadataPath(name, season);
  const url = asaEndpointUrl(name, season);
  if (!forceRefresh) {
    try {
      const rows = unwrapResponse(JSON.parse(await readFile(path, "utf8")));
      const contentSha256 = sha256CanonicalRows(rows);
      let retrievedAt: string | null = null;
      try {
        const metadata = JSON.parse(await readFile(metadataPath, "utf8")) as Partial<CacheMetadata>;
        if (metadata.contentSha256 === contentSha256 && typeof metadata.retrievedAt === "string" && Number.isFinite(Date.parse(metadata.retrievedAt))) {
          retrievedAt = new Date(metadata.retrievedAt).toISOString();
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      return { rows, fromCache: true, url, retrievedAt, contentSha256 };
    }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`ASA ${name} request failed (${response.status} ${response.statusText}): ${url}`);
  const body: unknown = await response.json();
  const rows = unwrapResponse(body);
  const retrievedAt = new Date().toISOString();
  const contentSha256 = sha256CanonicalRows(rows);
  await mkdir(join(process.cwd(), ".cache", "asa"), { recursive: true });
  await writeFile(path, JSON.stringify(body, null, 2));
  await writeFile(metadataPath, `${JSON.stringify({ retrievedAt, contentSha256 }, null, 2)}\n`);
  return { rows, fromCache: false, url, retrievedAt, contentSha256 };
}

export function field(row: AsaRow, ...names: string[]): unknown { return names.map((name) => row[name]).find((value) => value !== undefined && value !== null); }
export function textField(row: AsaRow, ...names: string[]): string | undefined { const value = field(row, ...names); return typeof value === "string" || typeof value === "number" ? String(value).trim() || undefined : undefined; }
export function numberField(row: AsaRow, ...names: string[]): number | undefined { const value = field(row, ...names); const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN; return Number.isFinite(number) ? number : undefined; }
