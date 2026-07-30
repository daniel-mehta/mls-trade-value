import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { validateComparisonPool, type ComparisonPool, type ComparisonPoolOverrides } from "../src/data/comparisonPool.js";
import type { PlayerDataset } from "../src/data/types.js";
try { const root = process.cwd(); const [pool, data, overrides] = await Promise.all([readFile(join(root,"public/data/comparison-pool.json"),"utf8"),readFile(join(root,"public/data/players.json"),"utf8"),readFile(join(root,"data/comparison-pool-overrides.json"),"utf8")]); const parsed = JSON.parse(pool) as ComparisonPool; const errors = validateComparisonPool(parsed, JSON.parse(data) as PlayerDataset, JSON.parse(overrides) as ComparisonPoolOverrides); if (errors.length) throw new Error(errors.join("\n- ")); console.log(`Comparison pool valid\n\nPlayers: ${parsed.players.length}\nSource: ${parsed.sourceDataVersion}`); } catch (error) { console.error(`Pool validation failed: ${(error as Error).message}`); process.exitCode=1; }
