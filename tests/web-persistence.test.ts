// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { applyBrowserVote, applySkip, initializeBrowserSession } from "../src/web/session.js";
import { poolPlayer, zeroRandom } from "./web-fixtures.js";

describe("Phase 3 memory-only restrictions", () => {
  it("session initialization does not read local storage", () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem");
    initializeBrowserSession([poolPlayer("a"), poolPlayer("b")], zeroRandom);
    expect(getItem).not.toHaveBeenCalled();
  });

  it("votes do not write local storage", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const session = initializeBrowserSession([poolPlayer("a"), poolPlayer("b")], zeroRandom);
    applyBrowserVote(session, session.currentMatchup!.playerAId, zeroRandom);
    expect(setItem).not.toHaveBeenCalled();
  });

  it("skip does not write local storage", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const session = initializeBrowserSession([poolPlayer("a"), poolPlayer("b")], zeroRandom);
    applySkip(session, zeroRandom);
    expect(setItem).not.toHaveBeenCalled();
  });

  it("votes and skips do not mutate source JSON objects", () => {
    const source = [poolPlayer("a"), poolPlayer("b"), poolPlayer("c")];
    const before = structuredClone(source);
    const session = initializeBrowserSession(source, zeroRandom);
    applySkip(applyBrowserVote(session, session.currentMatchup!.playerAId, zeroRandom).session, zeroRandom);
    expect(source).toEqual(before);
  });
});
