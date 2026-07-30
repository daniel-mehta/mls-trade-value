import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { selectComparisonPool, validateComparisonPool, type ComparisonPoolOverrides } from "../src/data/comparisonPool.js";
import { assertValidDataset } from "../src/data/validation.js";
import type { PlayerDataset } from "../src/data/types.js";

async function main(): Promise<void> { const root = process.cwd(); const dataset = JSON.parse(await readFile(join(root, "public/data/players.json"), "utf8")) as PlayerDataset; assertValidDataset(dataset);
  const rawOverrides = await readFile(join(root, "data/comparison-pool-overrides.json"), "utf8");
  const overrides = JSON.parse(rawOverrides) as ComparisonPoolOverrides; const pool = selectComparisonPool(dataset, overrides); const errors = validateComparisonPool(pool, dataset, overrides); if (errors.length) throw new Error(`Pool has ${pool.players.length} players. ${errors.join("\n- ")}`);
  await mkdir(join(root, "public/data"), { recursive: true }); await writeFile(join(root, "public/data/comparison-pool.json"), `${JSON.stringify(pool, null, 2)}\n`);
  const counts = Object.fromEntries(pool.players.flatMap(p => p.selectionReasons).reduce<Map<string, number>>((m, reason) => m.set(reason, (m.get(reason) ?? 0) + 1), new Map())); console.log(`Comparison pool generated: ${pool.players.length} players\nSelection reasons (non-exclusive): ${Object.entries(counts).map(([k,v]) => `${k}=${v}`).join(", ")}\nOutput: public/data/comparison-pool.json`);
}
main().catch(error => { console.error(`Pool build failed: ${(error as Error).message}`); process.exitCode = 1; });
