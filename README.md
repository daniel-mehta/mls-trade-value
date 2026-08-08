# MLS Trade Value Elo

MLS Trade Value Elo is a static browser tool for building a personal ranking of
MLS players through head-to-head choices. Each choice updates the two players'
Elo ratings; the result is your ranking, not a global score or an objective
valuation model.

**Live demo:** [danielmehta.com/mls-trade-value-elo](https://danielmehta.com/mls-trade-value-elo/)

## What the tool does

- Presents two eligible players at a time with role-appropriate statistical,
  salary, contract, and dated roster context when those fields are available.
- Updates a personal Elo ranking after each choice and shows compared players
  in **Your Top 25**.
- Uses adaptive scheduling to improve coverage, limit repetition, and gradually
  introduce rating similarity without changing the Elo calculation.
- Saves progress in the browser and supports reset, skip, CSV, TXT, and JSON
  export controls.
- Runs entirely as committed static files: no account, backend, runtime data
  API, or cloud ranking storage is required. The only external runtime service
  is optional GoatCounter aggregate usage analytics.

## How ranking works

Every player starts at 1500 Elo. The shared pure TypeScript Elo engine uses the
standard expected-score formula and a K-factor of 32. Ratings retain full
floating-point precision internally and are rounded only for display and
export.

Only players with at least one completed comparison receive a personal rank.
Ranked players are ordered by:

1. Elo, descending
2. Completed comparisons, descending
3. Wins, descending
4. Player name, ascending

Skipping advances the matchup without changing either player's Elo or counting
as a completed comparison. Early rankings are necessarily provisional while
most of the pool is unranked or lightly compared.

## Comparison pool

The committed browser pool is an eligibility and involvement filter, not a
trade-value ranking. Eligibility requires current-season minutes, or
previous-season minutes plus inclusion in the dated roster snapshot. Per
statistical team, the pool selects five eligible outfield players and one
goalkeeper using current minutes plus half of previous-season minutes. It also
includes eligible Designated Players, U22 Initiative players, and players with
at least five current-season goals plus primary assists. Deterministic
tie-breakers and strict, currently empty override files make the result
reproducible. A manual inclusion is still eligibility-bound and cannot add a
player who fails the minute-and-roster rule.

Pool membership does not assign Elo or imply relative value. Salary does not
determine eligibility, Elo, ranking position, or matchup priority.

## Matchup scheduling

Coverage of under-compared players is the scheduler's highest priority. It also
avoids recently repeated pairs and players, keeps bounded cooldown histories,
and uses cross-team and cross-position variety as a soft preference.

For the first 20 completed comparisons, a temporary metadata-derived policy
aims for exactly one featured player in about 65% of matchups.
The prominence preference uses a scheduler-only score: Designated Player status
(+3), U22 status
(+2), five or more current-season goal contributions (+2), base team-pool
selection (+1), and at least 900 current-season minutes (+1); a score of three
qualifies. It does not use names, fame, or salary. This influence decays from
comparisons 20 to 50 and is zero thereafter.

Elo similarity begins to influence some selections after 50 completed
comparisons, reaches full strength at 110, and retains periodic bridge matchups
for ranking connectivity. Scheduling changes only which players appear; it
does not change Elo calculations or ranking rules. Skips update cooldown history but
do not advance the saved completed-comparison count.

## Data and provenance

The data pipeline normalizes public American Soccer Analysis (ASA) player,
team, statistical, salary, goalkeeper, and parsed roster-profile sources into
two committed artifacts:

- `public/data/players.json`: the normalized source dataset
- `public/data/comparison-pool.json`: the validated browser-facing subset

Schema versions and semantic `sha256:` data versions are separate. Semantic
versions cover substantive source content, normalization rules, provenance,
overrides, selection rules, and membership; build timestamps are excluded. The
publication validator recomputes the versions and pool membership from the
committed files without refreshing sources or rewriting artifacts.

The browser loads only `comparison-pool.json` and local application assets at
runtime. Data is static and does not update automatically. Artifact build time,
verified statistical coverage, roster snapshot date, roster release-file date,
and salary release are distinct. `statisticsThrough` remains `null` unless the
consumed source metadata directly proves a coverage date; build time is never
used as a substitute. The roster snapshot can be older than the statistical
data and may not reflect current team assignments.

See [data/README.md](data/README.md) for normalization, eligibility, semantic
versioning, override, and publication details, and [data_notice.md](data_notice.md)
for the concise data notice.

## Goalkeeper handling

Goalkeeper cards use the official ASA goalkeeper xGoals and Goalkeeper Goals
Added source families. When available, cards show goalkeeper minutes, saves,
shots faced, xG faced, goals minus xG faced, and Goalkeeper Goals Added.
Current- and previous-season records remain separate, previous-season fallback
use is labelled explicitly, and missing goalkeeper fields are omitted rather
than invented or displayed as zero. These metrics provide comparison context
only; they do not directly affect Elo, scheduling, or pool membership.

## Persistence and privacy

Rankings persist only in `window.localStorage` under:

```text
daniel-mehta:mls-trade-value-elo:ranking-state
```

The schema-version-2 state stores stable player IDs, ratings, records, totals,
current and previous matchups, and bounded scheduler history—not full player
records. Dataset-version reconciliation retains returning-player records, adds
new players unranked, removes missing IDs, and repairs invalid matchup history.
Version 1 state migrates to the current format.

There are no accounts, cookies, ranking uploads, or cloud synchronization.
Rankings, Elo ratings, matchup history, and player choices remain in your
browser and are never uploaded. The site uses GoatCounter for privacy-preserving
aggregate usage analytics: page visits and the anonymous feature events vote,
skip, CSV/TXT/JSON export, and reset ranking. GoatCounter does not use cookies
or persistent tracking identifiers. No player-choice, ranking, Elo, matchup,
or export data is sent. When `navigator.doNotTrack === "1"`, the site prevents
both GoatCounter page visits and feature events. `Reset ranking` removes only
this application's key. Browser storage can be blocked or cleared and is not a
backup; rankings do not transfer between browsers, devices, or site origins.

## Exports

Exports are generated entirely in the browser and do not mutate Elo, matchup,
scheduler, or saved ranking state:

- **CSV:** every compared player in ranking order with identity, team,
  position, Elo, and record columns
- **Top 25 TXT:** up to 25 compared players in a compact text format
- **JSON:** the complete compared-player ranking plus explicit dataset, Elo,
  comparison-count, and export-format metadata

Untouched players are omitted. Exports are not import files and may contain
player names, personal ratings, and records, so review them before sharing.

## Running locally

Node.js 22 is used in GitHub Actions.

```sh
npm ci
npm run dev:web
```

Vite prints the development URL. To build and preview the production subpath:

```sh
npm run build:web
npm run preview:web
```

Then open `http://localhost:4173/mls-trade-value-elo/`.

## Testing and publication validation

```sh
npm test                 # complete Vitest suite
npm run build            # TypeScript type-check
npm run check:publication
npm run build:web        # publication gate, Vite build, deployment verification
npm run test:web         # focused browser modules
npm run audit:rosters
npm run audit:pool
```

`check:publication` validates player and pool schemas, semantic versions,
provenance, roster accounting, deterministic selection, source-to-pool
consistency, browser data handling, persistence, freshness copy, documentation,
and exports. It does not fetch external sources or regenerate data.

## Deployment

Vite uses `/` in development and `/mls-trade-value-elo/` for production.
Runtime data requests use `import.meta.env.BASE_URL`, so JSON, JavaScript, CSS,
and the favicon resolve beneath the deployed subpath.

The only intentional external runtime requests are GoatCounter's hosted script
and aggregate count endpoint: `https://gc.zgo.at/count.js` and
`https://danielmehta.goatcounter.com/count`. The browser makes no runtime
requests to ASA, MLS, salary, roster, goalkeeper, backend, or cloud-ranking
services. GoatCounter is optional and failures do not affect the application.

`.github/workflows/deploy-pages.yml` runs on pushes to `main` and manual
dispatch. Its build job installs locked dependencies, runs the full test suite,
runs the publication-gated production build, verifies `dist`, and uploads that
directory. A separate least-privilege deploy job publishes the artifact to the
`github-pages` environment. The workflow does not refresh source data and does
not require a personal token or repository secret.

## Limitations

- Elo represents one browser user's choices, not market value, consensus, or a
  predictive model.
- Pool selection measures eligibility and involvement; it is not an objective
  ranking and can omit valid trade-value candidates.
- Static statistics, salaries, contracts, and roster metadata can become stale
  and have different source dates and coverage.
- A verified statistics-through date is unavailable when source metadata does
  not prove one.
- Missing source fields reduce the context shown for some players.
- Browser-local state can be lost and has no account recovery or synchronization.

## Attribution, non-affiliation, and licence

Player and team statistics, salaries, and goalkeeper data are attributed to
[American Soccer Analysis](https://www.americansocceranalysis.com/). Dated
roster metadata comes from ASA's
[`mls-roster-profiles`](https://github.com/American-Soccer-Analysis/mls-roster-profiles)
repository, which parses club roster-profile sources.

This independent project is not affiliated with or endorsed by MLS, MLSPA,
American Soccer Analysis, any club, or any player. The repository's
[MIT licence](LICENSE) applies to the project code and documentation; it does
not establish ownership, redistribution rights, legal approval, or a licence
for underlying third-party data. Review current source terms and attribution
requirements before redistributing data artifacts.
