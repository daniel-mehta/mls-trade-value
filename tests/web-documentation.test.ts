import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const publicDocumentation = ["../README.md", "../data/README.md", "../data_notice.md"]
  .map((path) => readFileSync(new URL(path, import.meta.url), "utf8"))
  .join("\n");

describe("balanced matchup selection documentation", () => {
  it("does not expose the internal work label", () => {
    expect(publicDocumentation).not.toContain("Phase 5");
    expect(publicDocumentation).not.toMatch(/Phase 7(?:A)?/i);
  });

  it("explains coverage, variety, prominence, Elo timing, browser-only operation, and bounded state", () => {
    expect(publicDocumentation).toMatch(/under-compared/i);
    expect(publicDocumentation).toMatch(/recently repeated pairs and players|recent repeated pairs and players/i);
    expect(publicDocumentation).toMatch(/prominence preference/i);
    expect(publicDocumentation).toMatch(/Elo similarity/i);
    expect(publicDocumentation).toMatch(/does not change Elo\s+calculations|does not alter the Elo\s+calculation/i);
    expect(publicDocumentation).toMatch(/browser/i);
    expect(publicDocumentation).toMatch(/bounded/i);
  });

  it("documents publication provenance and eligibility-bound manual inclusion honestly", () => {
    expect(publicDocumentation).toMatch(/build time is not a statistics-through date/i);
    expect(publicDocumentation).toMatch(/manual inclusion is\s+still eligibility-bound/i);
    expect(publicDocumentation).toMatch(/salary acquisition is optional/i);
    expect(publicDocumentation).toMatch(/not affiliated with or endorsed/i);
    expect(publicDocumentation).toMatch(/Goalkeeper cards currently (?:contain|show) playing time only/i);
  });
});
