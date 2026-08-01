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
validates it before starting a shuffled, sequential matchup queue. The pool is
an involvement-based selection of real players, not a trade-value score or
ranking. A choice updates the two players through the shared Elo engine.
Only players with at least one completed comparison appear in **Your Top 25**,
ordered by the existing deterministic Elo tie-breakers.

## personal ranking storage

Your personal ranking is saved only in this browser with `window.localStorage`.
The application uses exactly one key:

```text
daniel-mehta:mls-trade-value-elo:ranking-state
```

Its stored object currently has schema version `1`. It contains the comparison
pool `dataVersion`, ISO save time, stable ASA player IDs, Elo values, win/loss
and comparison counts, completed/skipped totals, and the current/remaining
matchup schedule. It deliberately does **not** contain full player records,
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
