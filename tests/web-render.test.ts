// @vitest-environment jsdom
import { readFileSync } from "node:fs";
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

  it("renders current goalkeeper metrics without attacking zeros and keeps controls after fixed cards", () => {
    const root = document.createElement("div");
    const goalkeeper = poolPlayer("gk", {
      positionGroup: "GK",
      position: "GK",
      currentSeason: { season: 2026, minutes: 900, goals: 0, assists: 0, xGoals: 0, xAssists: 0 },
      goalkeeperMetrics: {
        currentSeason: {
          season: 2026,
          saves: 40,
          shotsFaced: 50,
          xGoalsFaced: 11.25,
          goalsMinusXGoalsFaced: -1.25,
          goalsAdded: 2,
          goalsAddedByAction: { passing: 0.75, shotstopping: 1.25 },
        },
      },
    });
    const session = initializeBrowserSession([goalkeeper, poolPlayer("b")], zeroRandom);
    renderApp(root, { session, status: idle }, { onChoose: vi.fn(), onSkip: vi.fn() });
    const goalkeeperCard = [...root.querySelectorAll(".player-card")].find((card) => card.textContent?.includes("Player GK"));
    expect(goalkeeperCard?.textContent).toContain("2026 MLS goalkeeper statistics");
    expect(goalkeeperCard?.textContent).toContain("Goalkeeper Goals Added2");
    expect(goalkeeperCard?.textContent).not.toContain("Primary assists");
    const cards = root.querySelector(".comparison-cards")!;
    const controls = root.querySelector(".comparison-controls")!;
    expect(cards.compareDocumentPosition(controls)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("renders previous-season and playing-time-only goalkeeper fallbacks honestly", () => {
    const root = document.createElement("div");
    const fallback = poolPlayer("gk", {
      positionGroup: "GK",
      position: "GK",
      currentSeason: { season: 2026 },
      previousSeason: { season: 2025, minutes: 800 },
      goalkeeperMetrics: { previousSeason: { season: 2025, saves: 25 } },
    });
    const playingTimeOnly = poolPlayer("other-gk", {
      positionGroup: "GK",
      position: "GK",
      currentSeason: { season: 2026, minutes: 90 },
    });
    const session = initializeBrowserSession([fallback, playingTimeOnly], zeroRandom);
    renderApp(root, { session, status: idle }, { onChoose: vi.fn(), onSkip: vi.fn() });
    expect(root.textContent).toContain("No 2026 MLS minutes. Showing available 2025 goalkeeper statistics.");
    expect(root.textContent).toContain("2026 MLS playing time");
    expect(root.textContent).not.toContain("N/A");
  });

  it("retains fixed desktop cards and horizontal-safe mobile card rules", () => {
    const styles = readFileSync("src/web/styles.css", "utf8");
    expect(styles).toMatch(/\.player-card\s*\{[^}]*height:\s*520px;[^}]*overflow:\s*hidden;/s);
    expect(styles).toMatch(/@media \(max-width: 820px\)[\s\S]*?\.player-card\s*\{[^}]*height:\s*auto;[^}]*overflow:\s*visible;/);
    expect(styles).toMatch(/@media \(max-width: 560px\)[\s\S]*?\.stats-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/);
    expect(styles).toMatch(/body\s*\{[^}]*min-width:\s*320px;/);
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

  it("preserves action focus across rerenders and returns focus after reset cancellation", () => {
    const root = document.createElement("div");
    document.body.append(root);
    const initial = initializeBrowserSession([poolPlayer("a"), poolPlayer("b")], zeroRandom);
    const handlers = { onChoose: vi.fn(), onSkip: vi.fn() };

    renderApp(root, { session: initial, status: idle }, handlers);
    const chooseA = root.querySelector<HTMLButtonElement>('[data-focus-key="choose-a"]')!;
    chooseA.focus();
    const voted = applyBrowserVote(initial, initial.currentMatchup!.playerAId, zeroRandom).session;
    renderApp(root, { session: voted, status: idle }, handlers);
    expect(document.activeElement?.getAttribute("data-focus-key")).toBe("choose-a");

    renderApp(root, { session: voted, status: idle, resetDialogOpen: true }, handlers);
    expect(document.activeElement?.getAttribute("data-focus-key")).toBe("reset-cancel");
    renderApp(root, { session: voted, status: idle, resetDialogOpen: false }, handlers);
    expect(document.activeElement?.getAttribute("data-focus-key")).toBe("reset-ranking");

    root.remove();
  });
});
