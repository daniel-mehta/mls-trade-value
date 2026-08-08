import "./styles.css";
import { PoolDataError, loadComparisonPool } from "./data.js";
import {
  deserializePersistedRankingState,
  restoreBrowserSession,
  serializePersistedRankingState,
} from "./persistence.js";
import { renderApp, renderFatalState, type RenderState } from "./render.js";
import { applyBrowserVote, applySkip, initializeBrowserSession } from "./session.js";
import { RankingStorageAdapter } from "./storage.js";
import { exportPersonalRanking } from "./exports/exporter.js";
import { trackUsageEvent } from "./analytics.js";

const SAVED_MESSAGE = "Your ranking is saved only in this browser. It is not uploaded or shared.";
const UNAVAILABLE_MESSAGE = "Saving unavailable. This session will reset on refresh.";
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

function getStorageAdapter(): RankingStorageAdapter | null {
  try {
    return new RankingStorageAdapter(window.localStorage);
  } catch (error) {
    console.warn("Browser storage is unavailable.", error);
    return null;
  }
}

try {
  const pool = await loadComparisonPool();
  const storage = getStorageAdapter();
  const state: RenderState = {
    session: initializeBrowserSession(pool.players),
    status: { kind: "idle", message: "Choose either player or skip this matchup." },
    dataMetadata: {
      season: pool.season,
      previousSeason: pool.previousSeason,
      generatedAt: pool.generatedAt,
      statisticsThrough: pool.provenance.statisticsThrough,
      rosterSnapshotDate: pool.provenance.rosterSnapshotDate,
      rosterReleaseDate: pool.provenance.rosterReleaseDate,
      salaryReleaseDate: pool.provenance.salaryReleaseDate,
      salaryCurrency: pool.provenance.salaryCurrency,
    },
    persistenceMessage: SAVED_MESSAGE,
    resetDialogOpen: false,
  };

  if (!storage) {
    state.persistenceMessage = UNAVAILABLE_MESSAGE;
  } else {
    const loaded = storage.loadRankingState();
    if (loaded.kind === "unavailable") {
      console.warn("Could not read saved ranking state.", loaded.error);
      state.persistenceMessage = UNAVAILABLE_MESSAGE;
    } else if (loaded.kind === "success") {
      const parsed = deserializePersistedRankingState(loaded.value);
      if (parsed.kind === "invalid") {
        console.warn("Discarding invalid saved ranking state:", parsed.reason);
        const removed = storage.removeRankingState();
        if (removed.kind === "unavailable") console.warn("Could not remove invalid saved ranking state.", removed.error);
        state.persistenceMessage = "Saved ranking data could not be restored. A new ranking was started.";
      } else {
        const restored = restoreBrowserSession(pool, parsed.state);
        if (restored.kind === "invalid") {
          console.warn("Discarding incompatible saved ranking state:", restored.reason);
          const removed = storage.removeRankingState();
          if (removed.kind === "unavailable") console.warn("Could not remove incompatible saved ranking state.", removed.error);
          state.persistenceMessage = "Saved ranking data could not be restored. A new ranking was started.";
        } else {
          state.session = restored.session;
          if (restored.kind === "reconciled") {
            const saved = storage.saveRankingState(serializePersistedRankingState(state.session, pool.dataVersion));
            if (saved.kind === "unavailable") console.warn("Could not save reconciled ranking state.", saved.error);
            state.persistenceMessage = saved.kind !== "success"
              ? UNAVAILABLE_MESSAGE
              : restored.reason === "dataset"
                ? "Player data was updated. Returning-player rankings were preserved."
                : restored.reason === "migration"
                  ? "Saved ranking updated for balanced matchup selection. Ratings and totals were preserved."
                  : "Saved ranking restored. Invalid matchup history was repaired.";
          } else {
            state.persistenceMessage = "Saved ranking restored from this browser.";
          }
        }
      }
    }
  }

  const saveSession = (): void => {
    if (!storage) { state.persistenceMessage = UNAVAILABLE_MESSAGE; return; }
    const saved = storage.saveRankingState(serializePersistedRankingState(state.session, pool.dataVersion));
    if (saved.kind === "success") {
      state.persistenceMessage = SAVED_MESSAGE;
    } else {
      console.warn("Could not save ranking state.", saved.error);
      state.persistenceMessage = UNAVAILABLE_MESSAGE;
    }
  };

  const rerender = () => renderApp(root, state, {
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
      saveSession();
      trackUsageEvent("vote");
      rerender();
    },
    onSkip() {
      state.session = applySkip(state.session);
      state.status = { kind: "skip", message: "Elo ratings did not change." };
      saveSession();
      trackUsageEvent("skip");
      rerender();
    },
    onRequestReset() { state.resetDialogOpen = true; rerender(); },
    onCancelReset() { state.resetDialogOpen = false; rerender(); },
    onConfirmReset() {
      state.session = initializeBrowserSession(pool.players);
      state.status = { kind: "idle", message: "Ranking reset. A new local session has started." };
      state.resetDialogOpen = false;
      if (!storage) {
        state.persistenceMessage = UNAVAILABLE_MESSAGE;
      } else {
        const removed = storage.removeRankingState();
        if (removed.kind === "success") {
          state.persistenceMessage = "Ranking reset. A new local session has started.";
        } else {
          console.warn("Could not remove saved ranking state during reset.", removed.error);
          state.persistenceMessage = "Ranking reset in this tab, but the saved copy could not be removed and may return after refresh.";
        }
      }
      trackUsageEvent("reset-ranking");
      rerender();
      root.querySelector<HTMLButtonElement>(".button--quiet")?.focus();
    },
    onExport(kind) {
      const result = exportPersonalRanking(kind, state.session, {
        dataVersion: pool.dataVersion,
        generatedAt: pool.generatedAt,
        provenance: pool.provenance,
      });
      state.status = result.kind === "success"
        ? { kind: "idle", message: `${kind === "text" ? "Top 25 TXT" : kind.toUpperCase()} ranking downloaded.` }
        : { kind: "idle", message: "The ranking export could not be created." };
      if (result.kind === "success") {
        trackUsageEvent(kind === "text" ? "export-txt" : `export-${kind}`);
      }
      rerender();
    },
  });
  rerender();
} catch (error) {
  console.error("Failed to initialize the MLS comparison interface.", error);
  renderFatalState(root, "Unable to start comparisons", poolErrorMessage(error));
}
