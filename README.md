# mls-trade-value-elo

A browser-based tool for creating personal MLS player trade-value rankings using pairwise Elo comparisons.

## browser app

Install dependencies and start the static TypeScript app:

```sh
npm install
npm run dev:web
```

Vite prints the local URL. Production builds and local production previews use:

```sh
npm run build:web
npm run preview:web
```

Run the focused browser suite with `npm run test:web`. Existing Elo, player-data,
roster, and comparison-pool commands remain separate; `npm test` runs all Vitest
tests.

The browser fetches the committed `public/data/comparison-pool.json` file and
validates it before starting adaptive comparison scheduling. Matchup selection
prioritizes under-compared players, avoids recently repeated pairs and players,
uses a modest early-session prominence preference from existing pool metadata,
and gradually considers Elo similarity after enough completed comparisons. The
scheduler changes only which two players appear; it does not change Elo
calculations. The pool remains an involvement-based selection of real players,
not a trade-value score or ranking. A choice updates the two players through the
shared Elo engine.
Only players with at least one completed comparison appear in **Your Top 25**,
ordered by the existing deterministic Elo tie-breakers.

## matchup-selection methodology

To make the earliest comparisons more recognizable and engaging, the scheduler
uses a temporary, metadata-derived featured-player preference. Its
scheduler-only score is:

| Signal | Score |
| --- | ---: |
| Designated Player | +3 |
| U22 Initiative player | +2 |
| 5+ current-season goals plus assists | +2 |
| Base team-pool selection | +1 |
| At least 900 current-season minutes | +1 |

A score of 3 or more qualifies a player for this temporary preference. It
affects matchup selection only: it never changes Elo, ranking position, or the
Personal Top 25, and it does not use player names, fame, or salary. Coverage of
under-compared players remains the highest priority.

The scheduler aims for exactly one featured player in approximately 65% of the
first 20 completed comparisons. This early-session prominence preference then
gradually decays from comparisons 20 to 50 and has no scheduling influence from
comparison 50 onward. Featured players may still appear after that through
normal coverage and matchup selection.

Timing is based on the saved `completedComparisons` count. The early preference
begins again only when there is no saved ranking, **Reset ranking** starts a new
one, saved data cannot be recovered and a fresh ranking starts, or the app is
used in a different browser, device, or site origin. Refreshing or reopening
the same browser does not restart it because the completed-comparison count is
restored from localStorage. Skips do not count as completed Elo comparisons,
though a skipped pair still updates matchup cooldown history.

## personal ranking storage

Your personal ranking is saved only in this browser with `window.localStorage`.
The application uses exactly one key:

```text
daniel-mehta:mls-trade-value-elo:ranking-state
```

Its stored object currently has schema version `2`. It contains the comparison
pool `dataVersion`, ISO save time, stable ASA player IDs, Elo values, win/loss
and comparison counts, completed/skipped totals, the current and previous
matchups, and bounded recent-pair/player cooldown histories. Version 1 saved
rankings migrate without losing valid ratings or totals. The stored state
deliberately does **not** contain full player records,
statistics, salary, contract or roster information, HTML, cookies, or any
account or sensitive information. `comparison-pool.json` remains the source of
truth for player data.

On a later pool update, ratings for returning ASA IDs are retained, new players
start at 1500 and unranked, removed players disappear, and the matchup schedule
is filtered or rebuilt safely. Invalid or unsupported saved data is discarded
without preventing a fresh ranking from starting.

Use **Reset ranking** in the Top 25 panel and confirm the native dialog to erase
only this application's saved key and start again. In browser developer tools,
open Application (or Storage) → Local Storage and inspect that key. Clearing
site data also clears the ranking. Development and production sites have
separate storage because they are different origins; rankings do not transfer
between browsers, devices, origins, or custom domains.

There is no backend, database, account, cookie, analytics, upload, sharing, or
cloud synchronization. The ranking is not written to repository files or Git
commits. Browser storage can be blocked or cleared, so it is not a backup or a
place for secrets.

Cards show 2026 MLS statistics when the player has 2026 minutes. When they do
not, the card explicitly says that it is showing available 2025 statistics.
Roster metadata is a static February 26, 2026 snapshot and must not be treated
as live roster information.

## ranking exports

The **Export ranking** controls in the Personal Ranking panel generate files
entirely in this browser. Nothing is uploaded, and downloading does not change
your saved ranking state, Elo ratings, matchup, or scheduling history.

- **CSV** downloads every compared player in your complete ranked list, with
  spreadsheet-friendly columns for identity, team, position, Elo, and record.
- **Top 25 TXT** downloads up to 25 compared players as plain shareable text.
- **JSON** downloads the complete compared-player ranking plus dataset, Elo,
  and comparison-count metadata. It is a ranking export, not currently an
  import file. Exported Elo values use the same two-decimal precision as the
  visible ranking.

Only players with at least one completed comparison receive a personal rank and
appear in these files; untouched pool players are omitted. Export files may
contain player names, ratings, and records, so review them before sharing
publicly.
