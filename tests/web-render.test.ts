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

  it("renders an accessible reset control and confirmation dialog", () => {
    const root = document.createElement("div");
    const requestReset = vi.fn();
    const cancelReset = vi.fn();
    const confirmReset = vi.fn();
    const session = initializeBrowserSession([poolPlayer("a"), poolPlayer("b")], zeroRandom);
    renderApp(root, { session, status: idle, resetDialogOpen: true }, {
      onChoose: vi.fn(), onSkip: vi.fn(), onRequestReset: requestReset, onCancelReset: cancelReset, onConfirmReset: confirmReset,
    });
    const reset = [...root.querySelectorAll("button")].find((button) => button.textContent === "Reset ranking");
    expect(reset).toBeTruthy();
    reset?.click();
    expect(requestReset).toHaveBeenCalledOnce();
    const dialog = root.querySelector("dialog");
    expect(dialog?.open).toBe(true);
    expect(dialog?.textContent).toContain("This will permanently erase your saved Elo ratings");
    dialog?.querySelector<HTMLButtonElement>(".button--secondary")?.click();
    expect(cancelReset).toHaveBeenCalledOnce();
  });

  it("keeps reset in a normal-flow ranking header before, not inside, the list", () => {
    const root = document.createElement("div");
    const initial = initializeBrowserSession([poolPlayer("a"), poolPlayer("b")], zeroRandom);
    const session = applyBrowserVote(initial, initial.currentMatchup!.playerAId, zeroRandom).session;
    renderApp(root, { session, status: idle }, { onChoose: vi.fn(), onSkip: vi.fn() });
    const header = root.querySelector(".ranking-header");
    const list = root.querySelector(".ranking-list");
    const reset = header?.querySelector<HTMLButtonElement>(".button--quiet");
    expect(header).not.toBeNull();
    expect(reset?.textContent).toBe("Reset ranking");
    expect(list).not.toBeNull();
    expect(header?.compareDocumentPosition(list!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(list?.contains(reset ?? null)).toBe(false);
    expect(reset?.getAttribute("style")).toBeNull();
    expect(reset?.className).not.toContain("absolute");
  });
});
