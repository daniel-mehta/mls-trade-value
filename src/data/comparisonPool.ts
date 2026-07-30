import type { PlayerDataset, PositionGroup, StaticPlayer } from "./types.js";
import { stablePlayerSort } from "./aggregation.js";

export const SELECTION_REASONS = ["team-outfield-selection", "team-goalkeeper-selection", "designated-player", "u22-initiative", "current-season-five-goal-contributions", "manual-inclusion"] as const;
export type SelectionReason = typeof SELECTION_REASONS[number];
export interface ComparisonPoolPlayer extends StaticPlayer { selectionReasons: SelectionReason[]; }
export interface ComparisonPool { schemaVersion: 1; dataVersion: string; sourceDataVersion: string; season: number; previousSeason: number; generatedAt: string; selectionRules: { baseOutfieldPlayersPerTeam: 5; baseGoalkeepersPerTeam: 1; previousSeasonMinutesWeight: 0.5; currentSeasonGoalContributionThreshold: 5; }; players: ComparisonPoolPlayer[]; }
export interface ComparisonPoolOverride { playerId: string; reason: string; sourceNote: string; }
export interface ComparisonPoolOverrides { schemaVersion: 1; include: ComparisonPoolOverride[]; exclude: ComparisonPoolOverride[]; }

export const rules = { baseOutfieldPlayersPerTeam: 5, baseGoalkeepersPerTeam: 1, previousSeasonMinutesWeight: 0.5, currentSeasonGoalContributionThreshold: 5 } as const;
const designationReason: Record<string, SelectionReason> = { "Designated Player": "designated-player", "U22 Initiative": "u22-initiative" };
export function designationSelectionReason(value: string | undefined): SelectionReason | undefined { return value ? designationReason[value] : undefined; }
export function eligible(player: StaticPlayer): boolean { return (player.currentSeason.minutes ?? 0) > 0 || (player.rosterProfile?.listedInRosterSnapshot === true && (player.previousSeason?.minutes ?? 0) > 0); }
export function participationScore(player: StaticPlayer): number { return (player.currentSeason.minutes ?? 0) + (player.previousSeason?.minutes ?? 0) * rules.previousSeasonMinutesWeight; }
function compareParticipation(a: StaticPlayer, b: StaticPlayer): number { return participationScore(b) - participationScore(a) || (b.currentSeason.minutes ?? 0) - (a.currentSeason.minutes ?? 0) || (b.previousSeason?.minutes ?? 0) - (a.previousSeason?.minutes ?? 0) || a.id.localeCompare(b.id); }
export function validateOverrides(value: unknown, players: readonly StaticPlayer[]): ComparisonPoolOverrides {
  const data = value as ComparisonPoolOverrides; const ids = new Set(players.map(p => p.id));
  if (!data || data.schemaVersion !== 1 || !Array.isArray(data.include) || !Array.isArray(data.exclude)) throw new Error("Pool overrides require schemaVersion 1 plus include/exclude arrays");
  const used = new Set<string>();
  for (const entry of [...data.include, ...data.exclude]) { if (!entry || !ids.has(entry.playerId) || !entry.reason?.trim() || !entry.sourceNote?.trim() || used.has(entry.playerId)) throw new Error(`Invalid, unknown, duplicate, or conflicting pool override: ${entry?.playerId ?? "unknown"}`); used.add(entry.playerId); }
  return data;
}
/** This compact pool preserves the full normalized dataset; participation is only an involvement filter, never a trade-value score. */
export function selectComparisonPool(dataset: PlayerDataset, overrides: ComparisonPoolOverrides): ComparisonPool {
  const source = structuredClone(dataset.players); const validOverrides = validateOverrides(overrides, source); const selected = new Map<string, Set<SelectionReason>>();
  const add = (p: StaticPlayer, reason: SelectionReason) => { if (eligible(p)) (selected.get(p.id) ?? selected.set(p.id, new Set()).get(p.id)!).add(reason); };
  for (const team of new Set(source.map(p => p.teamId))) {
    const candidates = source.filter(p => p.teamId === team && eligible(p)).sort(compareParticipation);
    // Five outfielders plus one keeper gives each club a transparent baseline without claiming those players are most valuable.
    candidates.filter(p => p.positionGroup !== "GK").slice(0, rules.baseOutfieldPlayersPerTeam).forEach(p => add(p, "team-outfield-selection"));
    candidates.filter(p => p.positionGroup === "GK").slice(0, rules.baseGoalkeepersPerTeam).forEach(p => add(p, "team-goalkeeper-selection"));
  }
  for (const p of source) { if (!eligible(p)) continue; const designation = designationSelectionReason(p.rosterProfile?.rosterDesignation); if (designation) add(p, designation);
    // This intentional attacker-biased safety net prevents productive scorers from missing the base participation cutoff.
    if ((p.currentSeason.goals ?? 0) + (p.currentSeason.assists ?? 0) >= rules.currentSeasonGoalContributionThreshold) add(p, "current-season-five-goal-contributions"); }
  for (const entry of validOverrides.include) add(source.find(p => p.id === entry.playerId)!, "manual-inclusion");
  for (const entry of validOverrides.exclude) selected.delete(entry.playerId);
  const players = stablePlayerSort(source.filter(p => selected.has(p.id)).map(p => ({ ...p, selectionReasons: SELECTION_REASONS.filter(reason => selected.get(p.id)!.has(reason)) })));
  return { schemaVersion: 1, dataVersion: `comparison-pool-${dataset.dataVersion}`, sourceDataVersion: dataset.dataVersion, season: dataset.season, previousSeason: dataset.previousSeason, generatedAt: new Date().toISOString(), selectionRules: rules, players };
}
export function validateComparisonPool(pool: ComparisonPool, dataset: PlayerDataset, overrides: ComparisonPoolOverrides): string[] {
  const errors: string[] = []; if (pool.schemaVersion !== 1 || pool.sourceDataVersion !== dataset.dataVersion || pool.players.length < 150 || pool.players.length > 325) errors.push("invalid pool metadata or unreasonable pool size");
  const source = new Map(dataset.players.map(p => [p.id, p])); const ids = new Set<string>(); const teams = new Set(dataset.players.map(p => p.teamId)); const groups: PositionGroup[] = ["GK", "DEF", "MID", "FWD"];
  try { validateOverrides(overrides, dataset.players); } catch (e) { errors.push((e as Error).message); }
  for (const p of pool.players) { if (!source.has(p.id) || ids.has(p.id)) errors.push(`invalid or duplicate player ${p.id}`); ids.add(p.id); if (!groups.includes(p.positionGroup) || !teams.has(p.teamId) || !p.selectionReasons.length || p.selectionReasons.some(r => !SELECTION_REASONS.includes(r)) || [...p.selectionReasons].sort((a,b) => SELECTION_REASONS.indexOf(a)-SELECTION_REASONS.indexOf(b)).join() !== p.selectionReasons.join() || JSON.stringify(p).includes("null") || !Number.isFinite(participationScore(p))) errors.push(`invalid player ${p.id}`); }
  if (stablePlayerSort(pool.players).some((p, i) => p.id !== pool.players[i]?.id)) errors.push("players are not deterministically ordered");
  for (const id of overrides.exclude.map(x => x.playerId)) if (ids.has(id)) errors.push(`excluded player present: ${id}`); return errors;
}
