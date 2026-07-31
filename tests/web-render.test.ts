// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { renderApp } from "../src/web/render.js";
import { applyBrowserVote, initializeBrowserSession } from "../src/web/session.js";
import { poolPlayer, zeroRandom } from "./web-fixtures.js";

describe("browser rendering", () => {
  const idle = { kind: "idle", message: "Ready" } as const;

  it("renders semantic named choice and skip buttons", () => {
    const root = document.createElement("div");
    const session = initializeBrowserSession([poolPlayer("a"), poolPlayer("b")], zeroRandom);
    renderApp(root, { session, status: idle }, { onChoose: vi.fn(), onSkip: vi.fn() });
    const labels = [...root.querySelectorAll("button")].map((button) => button.textContent);
    expect(labels).toEqual(expect.arrayContaining(["Choose Player A", "Choose Player B", "Skip"]));
    expect(root.querySelector(".comparison-controls .result-status")).toBeNull();
    expect(root.querySelector(".result-panel .result-status")).not.toBeNull();
    expect(root.querySelector(".workspace > .comparison-column")).not.toBeNull();
    expect(root.querySelector(".comparison-column > .comparison-cards")).not.toBeNull();
  });

  it("shows Unranked before a player's first comparison", () => {
    const root = document.createElement("div");
    const session = initializeBrowserSession([poolPlayer("a"), poolPlayer("b")], zeroRandom);
    renderApp(root, { session, status: idle }, { onChoose: vi.fn(), onSkip: vi.fn() });
    expect(root.textContent).toContain("Unranked");
    expect(root.textContent).toContain("Your Top 25 will appear after your first comparison.");
  });

  it("renders compared players in the personal Top 25", () => {
    const root = document.createElement("div");
    const initial = initializeBrowserSession([poolPlayer("a"), poolPlayer("b")], zeroRandom);
    const session = applyBrowserVote(initial, initial.currentMatchup!.playerAId, zeroRandom).session;
    renderApp(root, {
      session,
      status: {
        kind: "vote",
        winnerName: "Player A",
        winnerBefore: 1500,
        winnerAfter: 1516,
        loserName: "Player B",
        loserBefore: 1500,
        loserAfter: 1484,
      },
    }, { onChoose: vi.fn(), onSkip: vi.fn() });
    expect(root.querySelectorAll(".ranking-item")).toHaveLength(2);
    expect(root.textContent).toContain("Player AWinner1500.00 → 1516.00 Elo");
    expect(root.textContent).toContain("Player BLoser1500.00 → 1484.00 Elo");
    expect(root.querySelector(".result-status")?.getAttribute("aria-live")).toBe("polite");
  });

  it("does not render broken undefined or null optional values", () => {
    const root = document.createElement("div");
    const session = initializeBrowserSession([
      poolPlayer("a", { baseSalary: undefined, guaranteedCompensation: undefined, rosterProfile: undefined }),
      poolPlayer("b", { baseSalary: undefined, guaranteedCompensation: undefined, rosterProfile: undefined }),
    ], zeroRandom);
    renderApp(root, { session, status: idle }, { onChoose: vi.fn(), onSkip: vi.fn() });
    expect(root.textContent).not.toContain("undefined");
    expect(root.textContent).not.toContain("null");
  });
});
