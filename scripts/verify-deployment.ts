#!/usr/bin/env tsx
/*
 * Post-build verification for GitHub Pages deployment.
 * Checks that the production build in dist/ is correctly configured
 * for serving from /mls-trade-value-elo/ subpath.
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { cwd } from "node:process";

const DIST_DIR = join(cwd(), "dist");
const BASE_PATH = "/mls-trade-value-elo/";
const GOATCOUNTER_SCRIPT_URL = "https://gc.zgo.at/count.js";
const GOATCOUNTER_ENDPOINT = "https://danielmehta.goatcounter.com/count";

function error(message: string): never {
  console.error(`\nVerification failed: ${message}`);
  process.exitCode = 1;
  throw new Error(message);
}

function checkFileExists(path: string): void {
  if (!existsSync(path)) error(`File not found: ${path}`);
}

function checkFileContent(path: string, checks: RegExp[]): void {
  const content = readFileSync(path, "utf8");
  for (const regex of checks) {
    if (!regex.test(content)) error(`Pattern not found in ${path}: ${regex.source}`);
  }
}

function checkNoPattern(path: string, patterns: RegExp[]): void {
  const content = readFileSync(path, "utf8");
  for (const regex of patterns) {
    if (regex.test(content)) error(`Unexpected pattern in ${path}: ${regex.source}`);
  }
}

console.log("Verifying deployment build...\n");

// 1. Check required files exist
checkFileExists(join(DIST_DIR, "index.html"));
checkFileExists(join(DIST_DIR, "data", "comparison-pool.json"));
checkFileExists(join(DIST_DIR, "favicon.svg"));
console.log("✓ dist/index.html exists");
console.log("✓ dist/data/comparison-pool.json exists");
console.log("✓ dist/favicon.svg exists");

// 2. Check index.html has correct base path references
const indexPath = join(DIST_DIR, "index.html");
const indexContent = readFileSync(indexPath, "utf8");

// Check for base path in asset references
if (!indexContent.includes(BASE_PATH)) {
  error(`index.html does not contain base path references to ${BASE_PATH}`);
}
console.log(`✓ index.html contains ${BASE_PATH} references`);

// Check favicon reference uses base path
if (!indexContent.includes(`${BASE_PATH}favicon.svg`)) {
  error(`Favicon reference does not use ${BASE_PATH}`);
}
console.log(`✓ Favicon uses ${BASE_PATH} path`);

// 3. Check for correct title and description
checkFileContent(indexPath, [
  /<title>MLS Trade Value Elo<\/title>/
]);
console.log("✓ Correct title present");

const descPattern = /Build a personal MLS player trade-value ranking through head-to-head Elo comparisons\. Rankings stay in your browser and can be exported locally\./;
if (!descPattern.test(indexContent)) {
  error("Expected description not found");
}
console.log("✓ Correct description present");

// GoatCounter is the sole allowed external runtime service. Its inline DNT
// setting prevents the automatic page view before the hosted script loads.
if (!indexContent.includes(GOATCOUNTER_SCRIPT_URL) || !indexContent.includes(GOATCOUNTER_ENDPOINT)) {
  error("Expected GoatCounter script or endpoint is missing from index.html");
}
if (!/navigator\.doNotTrack === "1"[\s\S]*no_onload: true/.test(indexContent)) {
  error("GoatCounter DNT no_onload configuration is missing from index.html");
}
console.log("✓ GoatCounter script, endpoint, and DNT pageview suppression are present");

// 4. Check no absolute /data/comparison-pool.json references
// (should be /mls-trade-value-elo/data/comparison-pool.json)
checkNoPattern(indexPath, [
  /href="\/data\/comparison-pool\.json"/,
  /src="\/data\/comparison-pool\.json"/,
  /\/mls-trade-value\/data\/comparison-pool\.json/,
  /\/mls-trade-value\//,
]);
console.log("✓ No incorrect base path or root-relative data references in index.html");

// 5. Check built JS/CSS files for correct base path usage
// Find all JS/CSS files in dist/ that aren't in data/
import { readdirSync, statSync } from "node:fs";

function walkDir(dir: string, fileList: string[] = []): string[] {
  const files = readdirSync(dir);
  for (const file of files) {
    const path = join(dir, file);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      walkDir(path, fileList);
    } else if (stat.isFile() && (file.endsWith(".js") || file.endsWith(".css"))) {
      fileList.push(path);
    }
  }
  return fileList;
}

const assetFiles = walkDir(DIST_DIR).filter(f => !f.includes("/data/"));
if (assetFiles.length === 0) error("No JS/CSS asset files found in dist/");

for (const assetFile of assetFiles) {
  const content = readFileSync(assetFile, "utf8");
  
  // Check that it uses the base path for data requests
  // The pattern should be /mls-trade-value-elo/data/comparison-pool.json
  if (content.includes("/data/comparison-pool.json")) {
    error(`Found root-relative /data/comparison-pool.json reference in ${assetFile}`);
  }

  if (content.includes("/mls-trade-value/data/comparison-pool.json")) {
    error(`Found incorrect /mls-trade-value/ base path reference in ${assetFile}`);
  }
  
  if (content.includes(`${BASE_PATH}data/comparison-pool.json`)) {
    console.log(`✓ ${assetFile} uses correct ${BASE_PATH}data/comparison-pool.json`);
  }
}

// 6. Check no external ASA URL in built files
const asaUrl = "https://app.americansocceranalysis.com";
for (const assetFile of assetFiles) {
  checkNoPattern(assetFile, [new RegExp(asaUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))]);
}
console.log("✓ No external ASA URL in built assets");

const prohibitedAnalyticsHosts = [
  "google-analytics.com",
  "googletagmanager.com",
  "plausible.io",
  "posthog.com",
  "cloudflareinsights.com",
];
for (const path of [indexPath, ...assetFiles]) {
  checkNoPattern(path, prohibitedAnalyticsHosts.map((host) => new RegExp(host.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")));
}
console.log("✓ No other analytics-provider runtime references in built assets");

console.log("\n✅ All deployment verification checks passed!");
