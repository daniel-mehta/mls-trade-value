import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { COMPETITION } from "./types.js";

export const ASA_BASE_URL = "https://app.americansocceranalysis.com/api/v1";
export type AsaRow = Record<string, unknown>;
export type AsaDatasetName = "players" | "teams" | "xgoals" | "xpass" | "goals-added" | "salaries";

export interface AsaFetchResult { rows: AsaRow[]; fromCache: boolean; url: string; }

function cachePath(name: AsaDatasetName, season?: number): string {
  return join(process.cwd(), ".cache", "asa", `${name}-${season ?? "all"}.json`);
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
export async function fetchAsa(name: AsaDatasetName, season?: number, forceRefresh = false): Promise<AsaFetchResult> {
  const path = cachePath(name, season);
  const endpoint = name === "players" || name === "teams" ? name : `players/${name}`;
  const url = new URL(`${ASA_BASE_URL}/${COMPETITION}/${endpoint}`);
  if (season !== undefined) {
    url.searchParams.set("season_name", String(season));
    // Explicit groups make the expected player-team-season grain inspectable.
    if (name !== "players" && name !== "teams" && name !== "salaries") { url.searchParams.set("split_by_seasons", "true"); url.searchParams.set("split_by_teams", "true"); }
  }
  if (!forceRefresh) {
    try { return { rows: unwrapResponse(JSON.parse(await readFile(path, "utf8"))), fromCache: true, url: url.toString() }; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`ASA ${name} request failed (${response.status} ${response.statusText}): ${url}`);
  const body: unknown = await response.json();
  const rows = unwrapResponse(body);
  await mkdir(join(process.cwd(), ".cache", "asa"), { recursive: true });
  await writeFile(path, JSON.stringify(body, null, 2));
  return { rows, fromCache: false, url: url.toString() };
}

export function field(row: AsaRow, ...names: string[]): unknown { return names.map((name) => row[name]).find((value) => value !== undefined && value !== null); }
export function textField(row: AsaRow, ...names: string[]): string | undefined { const value = field(row, ...names); return typeof value === "string" || typeof value === "number" ? String(value).trim() || undefined : undefined; }
export function numberField(row: AsaRow, ...names: string[]): number | undefined { const value = field(row, ...names); const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN; return Number.isFinite(number) ? number : undefined; }
