import type { ComparisonPoolPlayer } from "../data/comparisonPool.js";
import type { RankedPlayer } from "../domain/types.js";
import { PRODUCT } from "./config.js";
import { formatDataFreshnessNotice, formatSeasonContext, type DataFreshnessMetadata } from "./freshness.js";
import {
  buildPlayerStatFields,
  buildRosterFields,
  formatElo,
  formatPositionLine,
  selectDisplayStats,
  type DisplayField,
} from "./display.js";
import {
  buildTop25,
  getComparedRank,
  isPlayerUnranked,
  type BrowserSession,
} from "./session.js";
import type { RankingExportKind } from "./exports/filename.js";

export interface RenderHandlers {
  onChoose(playerId: string): void;
  onSkip(): void;
  onRequestReset?(): void;
  onCancelReset?(): void;
  onConfirmReset?(): void;
  onExport?(kind: RankingExportKind): void;
}

export interface RenderState {
  session: BrowserSession;
  status: ComparisonStatus;
  dataMetadata?: DataFreshnessMetadata;
  persistenceMessage?: string;
  resetDialogOpen?: boolean;
}

export type ComparisonStatus =
  | { kind: "idle"; message: string }
  | { kind: "skip"; message: string }
  | {
      kind: "vote";
      winnerName: string;
      winnerBefore: number;
      winnerAfter: number;
      loserName: string;
      loserBefore: number;
      loserAfter: number;
    };

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function appendFields(container: HTMLElement, fields: readonly DisplayField[]): void {
  for (const field of fields) {
    const item = element("div", "fact");
    item.append(element("dt", "fact__label", field.label), element("dd", "fact__value", field.value));
    container.append(item);
  }
}

function playerCard(
  player: ComparisonPoolPlayer,
  side: "A" | "B",
  session: BrowserSession,
): HTMLElement {
  const card = element("article", `player-card player-card--${side.toLowerCase()}`);
  card.setAttribute("aria-labelledby", `player-${side.toLowerCase()}-name`);
  const header = element("header", "player-card__header");
  header.append(element("p", "eyebrow", `Player ${side}`));
  const name = element("h2", "player-card__name", player.name);
  name.id = `player-${side.toLowerCase()}-name`;
  header.append(name);
  header.append(element("p", "player-card__team", player.teamName));
  header.append(
    element("p", "player-card__position", formatPositionLine(player)),
  );

  const rating = session.ratings[player.id];
  const rank = getComparedRank(session, player.id);
  const ratingStrip = element("div", "rating-strip");
  const rankItem = element("div", "rating-strip__item");
  rankItem.append(
    element("span", "rating-strip__label", "Personal rank"),
    element("strong", "rating-strip__value", isPlayerUnranked(session, player.id) ? "Unranked" : `#${rank}`),
  );
  const eloItem = element("div", "rating-strip__item");
  eloItem.append(
    element("span", "rating-strip__label", "Elo"),
    element("strong", "rating-strip__value", formatElo(rating.elo)),
  );
  ratingStrip.append(rankItem, eloItem);

  const selected = selectDisplayStats(player);
  const statsSection = element("section", "card-section card-section--stats");
  statsSection.append(
    element(
      "h3",
      "card-section__title",
      `${selected.season} MLS ${player.positionGroup === "GK" && !selected.goalkeeperMetrics ? "playing time" : player.positionGroup === "GK" ? "goalkeeper statistics" : "statistics"}`,
    ),
  );
  if (selected.notice) statsSection.append(element("p", "fallback-note", selected.notice));
  const stats = element("dl", "stats-grid");
  appendFields(stats, buildPlayerStatFields(player, selected.stats, selected.goalkeeperMetrics));
  statsSection.append(stats);

  const rosterFields = buildRosterFields(player);
  const rosterSection = element("section", "card-section card-section--roster");
  rosterSection.append(element("h3", "card-section__title", "Contract and roster"));
  if (rosterFields.length) {
    const roster = element("dl", "details-list");
    appendFields(roster, rosterFields);
    rosterSection.append(roster);
  } else {
    rosterSection.append(element("p", "muted", "No contract or roster details are available."));
  }
  card.append(header, ratingStrip, statsSection, rosterSection);
  return card;
}

function top25Row(entry: RankedPlayer, rank: number): HTMLLIElement {
  const item = element("li", "ranking-item");
  const title = element("div", "ranking-item__title");
  title.append(
    element("span", "ranking-item__rank", `${rank}.`),
    element("span", "ranking-item__name", entry.player.name),
  );
  item.append(title);
  item.append(
    element(
      "p",
      "ranking-item__meta",
      `${entry.player.team} | ${formatElo(entry.elo)} Elo | ${entry.wins}-${entry.losses} | ${entry.comparisons} ${entry.comparisons === 1 ? "comparison" : "comparisons"}`,
    ),
  );
  return item;
}

function rankingExports(hasRankedPlayers: boolean, handlers: RenderHandlers): HTMLElement {
  const footer = element("section", "ranking-export");
  footer.setAttribute("aria-labelledby", "ranking-export-title");
  const title = element("h3", "ranking-export__title", "Export ranking");
  title.id = "ranking-export-title";
  const helper = element(
    "p",
    "ranking-export__helper",
    hasRankedPlayers
      ? "Download your compared-player ranking. Unranked players are omitted."
      : "Complete at least one comparison to export your ranking.",
  );
  helper.id = "ranking-export-help";
  const controls = element("div", "ranking-export__controls");
  const options: Array<[RankingExportKind, string]> = [
    ["csv", "CSV"], ["text", "Top 25 TXT"], ["json", "JSON"],
  ];
  for (const [kind, label] of options) {
    const button = element("button", "button button--secondary button--export", label);
    button.type = "button";
    button.disabled = !hasRankedPlayers;
    button.setAttribute("aria-describedby", "ranking-export-help");
    button.setAttribute("aria-label", `Download ranking as ${label}`);
    button.addEventListener("click", () => handlers.onExport?.(kind));
    controls.append(button);
  }
  footer.append(title, helper, controls);
  return footer;
}

function rankingSidebar(entries: readonly RankedPlayer[], handlers: RenderHandlers): HTMLElement {
  const aside = element("aside", "ranking-panel");
  aside.setAttribute("aria-labelledby", "top-25-title");
  const rankingHeader = element("div", "ranking-header");
  const headingGroup = element("div", "ranking-header__heading");
  headingGroup.append(element("p", "eyebrow", "Personal ranking"));
  const heading = element("h2", "ranking-panel__title", "Your Top 25");
  heading.id = "top-25-title";
  headingGroup.append(heading);
  const reset = element("button", "button button--quiet", "Reset ranking");
  reset.type = "button";
  reset.addEventListener("click", () => handlers.onRequestReset?.());
  rankingHeader.append(headingGroup, reset);
  aside.append(rankingHeader);
  if (!entries.length) {
    aside.append(
      element("p", "ranking-empty", "Your Top 25 will appear after your first comparison."),
    );
  } else {
    const list = element("ol", "ranking-list");
    entries.forEach((entry, index) => list.append(top25Row(entry, index + 1)));
    aside.append(list);
  }
  aside.append(rankingExports(entries.length > 0, handlers));
  return aside;
}

function resetDialog(handlers: RenderHandlers): HTMLDialogElement {
  const dialog = element("dialog", "reset-dialog");
  dialog.setAttribute("aria-labelledby", "reset-dialog-title");
  dialog.setAttribute("aria-describedby", "reset-dialog-description");
  const heading = element("h2", "reset-dialog__title", "Reset your ranking?");
  heading.id = "reset-dialog-title";
  const description = element("p", "reset-dialog__description", "This will permanently erase your saved Elo ratings, records, comparison history, skipped count, and current matchup from this browser.");
  description.id = "reset-dialog-description";
  const actions = element("div", "reset-dialog__actions");
  const cancel = element("button", "button button--secondary", "Cancel");
  cancel.type = "button";
  cancel.addEventListener("click", () => handlers.onCancelReset?.());
  const confirm = element("button", "button button--danger", "Reset ranking");
  confirm.type = "button";
  confirm.addEventListener("click", () => handlers.onConfirmReset?.());
  actions.append(cancel, confirm);
  dialog.append(heading, description, actions);
  dialog.addEventListener("cancel", (event) => { event.preventDefault(); handlers.onCancelReset?.(); });
  return dialog;
}

function comparisonControls(
  playerA: ComparisonPoolPlayer,
  playerB: ComparisonPoolPlayer,
  handlers: RenderHandlers,
): HTMLElement {
  const controls = element("section", "comparison-controls");
  controls.setAttribute("aria-labelledby", "comparison-question");
  const question = element(
    "h2",
    "comparison-controls__question",
    "Which player has greater MLS trade value?",
  );
  question.id = "comparison-question";
  const buttons = element("div", "comparison-controls__buttons");
  const chooseA = element("button", "button button--primary", `Choose ${playerA.name}`);
  chooseA.type = "button";
  chooseA.addEventListener("click", () => handlers.onChoose(playerA.id));
  const chooseB = element("button", "button button--primary", `Choose ${playerB.name}`);
  chooseB.type = "button";
  chooseB.addEventListener("click", () => handlers.onChoose(playerB.id));
  const skip = element("button", "button button--secondary", "Skip");
  skip.type = "button";
  skip.addEventListener("click", handlers.onSkip);
  buttons.append(chooseA, chooseB, skip);

  controls.append(question, buttons);
  return controls;
}

function comparisonStatus(state: RenderState): HTMLElement {
  const panel = element("section", `result-panel result-panel--${state.status.kind}`);
  panel.setAttribute("aria-label", "Latest comparison result");
  const announcement = element("div", "result-status");
  announcement.setAttribute("role", "status");
  announcement.setAttribute("aria-live", "polite");
  announcement.setAttribute("aria-atomic", "true");

  if (state.status.kind === "vote") {
    const winner = element("div", "result-player result-player--winner");
    const winnerHeading = element("p", "result-player__heading");
    winnerHeading.append(
      element("strong", "result-player__name", state.status.winnerName),
      element("span", "result-player__label", "Winner"),
    );
    winner.append(
      winnerHeading,
      element(
        "p",
        "result-player__elo",
        `${formatElo(state.status.winnerBefore)} → ${formatElo(state.status.winnerAfter)} Elo`,
      ),
    );

    const loser = element("div", "result-player");
    const loserHeading = element("p", "result-player__heading");
    loserHeading.append(
      element("strong", "result-player__name", state.status.loserName),
      element("span", "result-player__label", "Loser"),
    );
    loser.append(
      loserHeading,
      element(
        "p",
        "result-player__elo",
        `${formatElo(state.status.loserBefore)} → ${formatElo(state.status.loserAfter)} Elo`,
      ),
    );
    announcement.append(winner, loser);
  } else {
    announcement.append(
      element("strong", "result-status__label", state.status.kind === "skip" ? "Skipped" : "Status"),
      element("span", "result-status__message", state.status.message),
    );
  }

  const progress = element(
    "p",
    "comparison-progress",
    `${state.session.completedComparisons} completed · ${state.session.skippedMatchups} skipped`,
  );
  panel.append(announcement, progress);
  return panel;
}

export function renderApp(
  root: HTMLElement,
  state: RenderState,
  handlers: RenderHandlers,
): void {
  const matchup = state.session.currentMatchup;
  if (!matchup) throw new Error("The browser session has no current matchup.");
  const byId = new Map(state.session.players.map((player) => [player.id, player]));
  const playerA = byId.get(matchup.playerAId);
  const playerB = byId.get(matchup.playerBId);
  if (!playerA || !playerB) throw new Error("The current matchup contains an unknown player.");

  const page = element("main", "page-shell");
  const header = element("header", "site-header");
  const headerCopy = element("div", "site-header__copy");
  headerCopy.append(element("p", "eyebrow", PRODUCT.repositoryName));
  headerCopy.append(element("h1", "site-title", PRODUCT.title));
  headerCopy.append(element("p", "site-subtitle", PRODUCT.subtitle));
  headerCopy.append(
    element(
      "p",
      "site-explainer",
      "Each choice updates these players’ Elo ratings and your personal Top 25.",
    ),
  );
  const notices = element("div", "site-notices");
  notices.append(
    element("p", "persistence-notice", state.persistenceMessage ?? "Your ranking is saved only in this browser. It is not uploaded or shared."),
    element("p", "data-note", formatSeasonContext(state.dataMetadata ?? {})),
    element("p", "data-freshness", formatDataFreshnessNotice(state.dataMetadata ?? {})),
    element("p", "pool-note", `${state.session.players.length} real players loaded from the static comparison pool.`),
  );
  header.append(headerCopy, notices);

  const workspace = element("div", "workspace");
  const comparisonColumn = element("div", "comparison-column");
  const comparisonCards = element("section", "comparison-cards");
  comparisonCards.setAttribute("aria-label", "Current player comparison");
  comparisonCards.append(
    playerCard(playerA, "A", state.session),
    playerCard(playerB, "B", state.session),
  );
  comparisonColumn.append(
    comparisonCards,
    comparisonControls(playerA, playerB, handlers),
    comparisonStatus(state),
  );
  workspace.append(rankingSidebar(buildTop25(state.session), handlers), comparisonColumn);
  page.append(header, workspace, resetDialog(handlers));
  root.replaceChildren(page);

  const dialog = page.querySelector<HTMLDialogElement>(".reset-dialog");
  if (state.resetDialogOpen && dialog) {
    try { dialog.showModal(); } catch { dialog.open = true; }
    dialog.querySelector<HTMLButtonElement>(".button--secondary")?.focus();
  }
}

export function renderFatalState(
  root: HTMLElement,
  heading: string,
  message: string,
): void {
  const main = element("main", "app-state app-state--error");
  main.setAttribute("role", "alert");
  main.append(element("p", "eyebrow", PRODUCT.title), element("h1", "site-title", heading), element("p", "site-subtitle", message));
  root.replaceChildren(main);
}
