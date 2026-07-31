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

state exists only in JavaScript memory. Reloading or closing the page
resets every Elo rating to 1500, every record and comparison count to zero, the
Top 25, and the matchup queue. There is no `localStorage`, other browser
persistence, backend, database, account system, or analytics.

Cards show 2026 MLS statistics when the player has 2026 minutes. When they do
not, the card explicitly says that it is showing available 2025 statistics.
Roster metadata is a static February 26, 2026 snapshot and must not be treated
as live roster information.
