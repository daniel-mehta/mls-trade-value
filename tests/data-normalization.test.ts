import { describe, expect, it } from "vitest";
import { normalizePosition, requirePosition } from "../src/data/position.js";

describe("ASA position normalization", () => {
  it.each([["GK", "GK"], ["D", "DEF"], ["DF", "DEF"], ["CB", "DEF"], ["FB", "DEF"], ["M", "MID"], ["AM", "MID"], ["CM", "MID"], ["DM", "MID"], ["F", "FWD"], ["ST", "FWD"], ["W", "FWD"]] as const)("maps observed %s", (source, expected) => expect(normalizePosition(source)).toBe(expected));
  it("rejects an unknown position", () => expect(() => requirePosition("Wingback")).toThrow("Unrecognized ASA position"));
});
