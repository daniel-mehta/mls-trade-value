import { textField, type AsaRow } from "./asaClient.js";

/**
 * ASA can return multiple MLSPA releases for one player-season. Salaries are
 * snapshots, not match components: select one latest release and never sum it.
 */
export function latestSalaryByPlayer(rows: AsaRow[]): Map<string, AsaRow> {
  const byPlayer = new Map<string, AsaRow[]>();
  for (const row of rows) {
    const id = textField(row, "player_id", "playerId");
    if (id) (byPlayer.get(id) ?? byPlayer.set(id, []).get(id)!).push(row);
  }
  const selected = new Map<string, AsaRow>();
  for (const [id, playerRows] of byPlayer) {
    const dated = playerRows.map((row) => ({ row, release: textField(row, "mlspa_release") }))
      .filter((entry): entry is { row: AsaRow; release: string } => Boolean(entry.release && /^\d{4}-\d{2}-\d{2}$/.test(entry.release)));
    const latest = dated.length ? [...dated].sort((a, b) => a.release.localeCompare(b.release)).at(-1)!.release : undefined;
    const candidates = latest ? dated.filter((entry) => entry.release === latest).map((entry) => entry.row) : playerRows;
    const unique = new Map(candidates.map((row) => [JSON.stringify(row), row]));
    if (unique.size > 1) throw new Error(`Ambiguous salary rows for player ${id}: no single latest MLSPA release`);
    selected.set(id, candidates[0]);
  }
  return selected;
}
