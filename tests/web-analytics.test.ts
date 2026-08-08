import { describe, expect, it, vi } from "vitest";
import { trackUsageEvent, USAGE_EVENTS, type AnalyticsEnvironment } from "../src/web/analytics.js";
import { applyBrowserVote, applySkip, initializeBrowserSession } from "../src/web/session.js";
import { poolPlayer, zeroRandom } from "./web-fixtures.js";

function environment(overrides: Partial<AnalyticsEnvironment> = {}): AnalyticsEnvironment {
  return { navigator: { doNotTrack: "0" }, ...overrides };
}

describe("optional GoatCounter usage analytics", () => {
  it("sends only each fixed event path and title", () => {
    const count = vi.fn();
    const expected = [
      ["vote", "Vote"], ["skip", "Skip"], ["export-csv", "Export CSV"],
      ["export-txt", "Export TXT"], ["export-json", "Export JSON"], ["reset-ranking", "Reset ranking"],
    ];
    for (const event of USAGE_EVENTS) trackUsageEvent(event, environment({ goatcounter: { count } }));
    expect(count.mock.calls.map(([payload]) => [payload.path, payload.title, payload.event])).toEqual(
      expected.map(([path, title]) => [path, title, true]),
    );
    for (const [payload] of count.mock.calls) expect(Object.keys(payload).sort()).toEqual(["event", "path", "title"]);
  });

  it("rejects an unrecognized runtime value instead of forwarding it", () => {
    const count = vi.fn();
    trackUsageEvent("Player A: 1523 Elo" as never, environment({ goatcounter: { count } }));
    expect(count).not.toHaveBeenCalled();
  });

  it("does nothing when GoatCounter is missing, blocked, throws, or DNT is enabled", () => {
    expect(() => trackUsageEvent("vote", environment())).not.toThrow();
    expect(() => trackUsageEvent("vote", environment({ goatcounter: { count: () => { throw new Error("blocked"); } } }))).not.toThrow();
    const count = vi.fn();
    trackUsageEvent("vote", { goatcounter: { count }, navigator: { doNotTrack: "1" } });
    expect(count).not.toHaveBeenCalled();
  });

  it("cannot alter vote or skip session behavior when analytics throws", () => {
    const initial = initializeBrowserSession([poolPlayer("a"), poolPlayer("b")], zeroRandom);
    const vote = applyBrowserVote(initial, initial.currentMatchup!.playerAId, zeroRandom);
    expect(() => trackUsageEvent("vote", environment({ goatcounter: { count: () => { throw new Error("blocked"); } } }))).not.toThrow();
    expect(vote.session.completedComparisons).toBe(1);
    expect(vote.session.ratings[vote.result.winnerId].wins).toBe(1);

    const skipped = applySkip(vote.session, zeroRandom);
    expect(() => trackUsageEvent("skip", environment({ goatcounter: { count: () => { throw new Error("blocked"); } } }))).not.toThrow();
    expect(skipped.completedComparisons).toBe(1);
    expect(skipped.skippedMatchups).toBe(1);
  });
});
