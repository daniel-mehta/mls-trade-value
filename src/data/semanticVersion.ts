import { createHash } from "node:crypto";
import type { ComparisonPool } from "./comparisonPool.js";
import type { PlayerDataset, SourceSnapshot } from "./types.js";

export const SEMANTIC_DIGEST_ALGORITHM = "SHA-256" as const;
export const SEMANTIC_VERSION_PREFIX = "sha256:";

type CanonicalOptions = { sortArrays?: boolean };

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function canonicalValue(value: unknown, options: CanonicalOptions): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Cannot canonicalize a non-finite number");
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) {
    const items = value.map((entry) => canonicalValue(entry, options));
    return options.sortArrays
      ? items.sort((a, b) => compareText(JSON.stringify(a), JSON.stringify(b)))
      : items;
  }
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort(compareText)) {
      const entry = (value as Record<string, unknown>)[key];
      if (entry !== undefined) output[key] = canonicalValue(entry, options);
    }
    return output;
  }
  throw new Error(`Cannot canonicalize ${typeof value}`);
}

/** RFC-8259-compatible deterministic JSON: sorted object keys, preserved arrays. */
export function canonicalStringify(value: unknown): string {
  return JSON.stringify(canonicalValue(value, {}));
}

export function sha256Canonical(value: unknown): string {
  return createHash("sha256").update(canonicalStringify(value)).digest("hex");
}

/** Source endpoint row order is not semantic, so canonical rows are sorted first. */
export function sha256CanonicalRows(rows: readonly unknown[]): string {
  const canonicalRows = rows.map((row) => canonicalValue(row, {}));
  canonicalRows.sort((a, b) => compareText(JSON.stringify(a), JSON.stringify(b)));
  return sha256Canonical(canonicalRows);
}

/** Repository JSON array ordering is likewise not a source-content identity. */
export function sha256CanonicalUnordered(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalValue(value, { sortArrays: true })))
    .digest("hex");
}

export function semanticVersion(value: unknown): string {
  return `${SEMANTIC_VERSION_PREFIX}${sha256Canonical(value)}`;
}

function semanticSource(source: SourceSnapshot): Omit<SourceSnapshot, "retrievedAt"> {
  const { retrievedAt: _retrievedAt, ...semantic } = source;
  return semantic;
}

export function playerSemanticPayload(dataset: PlayerDataset): unknown {
  return {
    schemaVersion: dataset.schemaVersion,
    competition: dataset.competition,
    season: dataset.season,
    previousSeason: dataset.previousSeason,
    statisticsThrough: dataset.statisticsThrough,
    sources: [...dataset.sources]
      .sort((a, b) => compareText(a.sourceId, b.sourceId))
      .map(semanticSource),
    salary: dataset.salary,
    rosterSnapshot: dataset.rosterSnapshot,
    overrides: dataset.overrides,
    normalization: dataset.normalization,
    audit: dataset.audit,
    players: [...dataset.players].sort((a, b) => compareText(a.id, b.id)),
  };
}

export function computePlayerDataVersion(dataset: PlayerDataset): string {
  return semanticVersion(playerSemanticPayload(dataset));
}

export function poolSemanticPayload(pool: ComparisonPool): unknown {
  return {
    schemaVersion: pool.schemaVersion,
    sourceDataVersion: pool.sourceDataVersion,
    selectionRules: pool.selectionRules,
    overrides: pool.overrides,
    players: [...pool.players].sort((a, b) => compareText(a.id, b.id)),
  };
}

export function computePoolDataVersion(pool: ComparisonPool): string {
  return semanticVersion(poolSemanticPayload(pool));
}

export function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

export function isSemanticVersion(value: unknown): value is string {
  return typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value);
}
