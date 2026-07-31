import "./styles.css";
import { PoolDataError, loadComparisonPool } from "./data.js";
import { renderApp, renderFatalState, type RenderState } from "./render.js";
import { applyBrowserVote, applySkip, initializeBrowserSession } from "./session.js";

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("Missing #app root element.");

function poolErrorMessage(error: unknown): string {
  if (error instanceof PoolDataError) {
    if (error.reason === "empty") return "The player pool is empty. Build a valid comparison pool and try again.";
    if (error.reason === "too-small") return "The player pool needs at least two eligible players.";
    return "The player pool is invalid. Check the generated data and try again.";
  }
  return "The player pool could not be loaded. Check that the static data file is available and try again.";
}

try {
  const pool = await loadComparisonPool();
  const state: RenderState = {
    session: initializeBrowserSession(pool.players),
    status: { kind: "idle", message: "Choose either player or skip this matchup." },
    dataGeneratedAt: pool.generatedAt,
  };
  const rerender = () =>
    renderApp(root, state, {
      onChoose(playerId) {
        const byId = new Map(state.session.players.map((player) => [player.id, player]));
        const { session, result } = applyBrowserVote(state.session, playerId);
        state.session = session;
        state.status = {
          kind: "vote",
          winnerName: byId.get(result.winnerId)?.name ?? result.winnerId,
          winnerBefore: result.winnerBefore,
          winnerAfter: result.winnerAfter,
          loserName: byId.get(result.loserId)?.name ?? result.loserId,
          loserBefore: result.loserBefore,
          loserAfter: result.loserAfter,
        };
        rerender();
      },
      onSkip() {
        state.session = applySkip(state.session);
        state.status = { kind: "skip", message: "Elo ratings did not change." };
        rerender();
      },
    });
  rerender();
} catch (error) {
  console.error("Failed to initialize the MLS comparison interface.", error);
  renderFatalState(root, "Unable to start comparisons", poolErrorMessage(error));
}
