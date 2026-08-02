import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const publicDocumentation = ["../README.md", "../data/README.md"]
  .map((path) => readFileSync(new URL(path, import.meta.url), "utf8"))
  .join("\n");

describe("balanced matchup selection documentation", () => {
  it("does not expose the internal work label", () => {
    expect(publicDocumentation).not.toContain("Phase 5");
  });

  it("explains coverage, variety, prominence, Elo timing, browser-only operation, and bounded state", () => {
    expect(publicDocumentation).toMatch(/under-compared/i);
    expect(publicDocumentation).toMatch(/recently repeated pairs and players|recent repeated pairs and players/i);
    expect(publicDocumentation).toMatch(/prominence preference/i);
    expect(publicDocumentation).toMatch(/Elo similarity/i);
    expect(publicDocumentation).toMatch(/does not change Elo calculations|does not alter the Elo calculation/i);
    expect(publicDocumentation).toMatch(/browser/i);
    expect(publicDocumentation).toMatch(/bounded/i);
  });
});
