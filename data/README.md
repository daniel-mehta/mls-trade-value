# MLS player data snapshot

`public/data/players.json` is a generated static snapshot for the browser. The
browser must never call American Soccer Analysis (ASA) directly.

## Source and commands

The sole source is ASA's free public API: `GET /mls/players`,
`/mls/teams`, `/mls/players/xgoals`, `/xpass`, `/goals-added`, and `/salaries`.
No API key or paid service is used. Generate and inspect it with:

```sh
npm run probe:data
npm run build:data
npm run validate:data
```

Use `-- --refresh` with the first two commands to bypass `.cache/asa/`.
Raw cached responses are deliberately ignored by git; only the generated JSON
snapshot is intended to be committed. Seasons default to 2026 and 2025 and can
be changed for a run with `MLS_CURRENT_SEASON` and `MLS_PREVIOUS_SEASON`.

## Rules

- Stable ASA player IDs, team IDs, and seasons are the join keys. Names are
  never used as a silent fallback.
- ASA requests are split by season and team. Additive player-team components
  are summed. The ASA players endpoint has no current-team field; for a
  multi-team current season the displayed team is the one with most minutes.
  A recent transfer can therefore display a former club until a later
  roster/manual-override addition.
- The observed ASA general positions map explicitly: `GK` → GK; `CB`/`FB` →
  DEF; `AM`/`CM`/`DM` → MID; and `ST`/`W` → FWD. Equivalent broad aliases are
  supported too. Unknown values are reported and excluded rather than guessed.
- A player is eligible only with required identity/team/position fields and at
  least one recorded minute in the current or previous season. Missing salary
  does not exclude a player. Base salary and guaranteed compensation remain
  separate optional numeric fields. Multiple MLSPA salary releases are never
  summed: the latest valid `mlspa_release` is selected, and conflicting rows at
  that release fail the build.

The generated data includes only ASA fields observed by `probe:data`; unavailable
statistics are omitted rather than fabricated. ASA data is not represented as
official MLS data. Recheck ASA's current terms and attribution guidance before
publishing or redistributing a refreshed snapshot.

Known limitations: the API may not yet carry the configured current season, and
salary coverage can lag statistics. A failed request stops the build so a stale
or partial result cannot be presented as a successful refresh.

## roster snapshot

The build also uses the published JSON releases in ASA's
[`mls-roster-profiles`](https://github.com/American-Soccer-Analysis/mls-roster-profiles)
repository. It lists JSON candidates, parses their embedded `release_date`, and
selects the latest 2026 release; filenames are never used as the date authority.
The selected 2026 release is a **static 2026-02-26 snapshot**, not a live roster.
Transfers, loans, injuries, waivers, and signings after that date are not implied.

Roster records join the statistical records only by ASA player ID. Snapshot team
ID/name stays within `rosterProfile`, separately from the statistical team; a
disagreement is reported rather than guessed away. Missing IDs and unmatched
records are likewise reported. `activeAtRosterSnapshot` means listed, not marked
unavailable, and not in the explicit `Off-Roster (Unavailable)` slot.

Available fields include slot, designation, status, contract-through, normalized
option years, permanent-transfer option, international status, TAM convertibility,
unavailability, Canadian exemption, and team roster-construction model. Missing
booleans are omitted, not changed to false. Raw release data is cached under
`.cache/rosters/` and ignored by git; `--refresh` refreshes both ASA sources.

`data/roster-overrides.json` is the deliberately empty framework for later
documented corrections. Future overrides must name an ASA player ID, effective
date, reason, source note, and explicit replacement fields. Precedence is
statistics, then ASA snapshot, then a validated override. No comparison pool or
trade-value ranking is selected in this phase.

### Overrides

The checked-in empty file is valid. Each entry has `playerId`, ISO
`effectiveDate`, `reason`, `sourceNote`, and a non-empty `fields` object. The
supported fields are `teamId`, `snapshotTeamId`, `snapshotTeamName`,
`listedInRosterSnapshot`, `activeAtRosterSnapshot`, `rosterSlot`,
`rosterDesignation`, `currentStatus`, `contractThrough`, `optionYears`,
`permanentTransferOption`, `internationalSlot`, `convertibleWithTam`,
`unavailable`, `canadianInternationalSlotExemption`, and
`rosterConstructionModel`.

```json
{"playerId":"ASA_ID","effectiveDate":"2026-03-01","reason":"Roster correction","sourceNote":"Club announcement","fields":{"rosterSlot":"Senior Roster"}}
```

Duplicate/unknown players, bad dates, blank explanation fields, empty/unknown
field objects, invalid booleans or option-year arrays, and unknown team IDs fail
the build. Applied count is recorded as `manualOverridesApplied` and printed by
both build and audit commands. Audit activity, unavailable, and off-roster
counts are explicitly non-exclusive: unavailable/off-roster players are not
active, and an off-roster player can also be unavailable.

The audit accounts for every source record as matched, unmatched, or a duplicate
ignored after documented loan-pair resolution; missing player IDs are shown as a
subset of unmatched records. This avoids treating duplicate source rows as a
silent discrepancy.

## comparison pool

`public/data/comparison-pool.json` is a separate, generated subset for future
pairwise comparisons. It never replaces `players.json`: selection is an
eligibility/involvement filter, **not a trade-value model or ranking**. Build,
validate, inspect, and manually exercise it with:

```sh
npm run build:pool
npm run validate:pool
npm run audit:pool
npm run demo:pool
```

Eligible players have a 2026 MLS minute, or are listed in the February 2026
snapshot with a 2025 MLS minute. Unavailable snapshot players are not excluded.
For each statistical team, the pool includes the top five eligible outfield
players and top eligible goalkeeper by `2026 minutes + (2025 minutes * 0.5)`.
This participation score is only an involvement filter, not an estimate of
trade value. Ties use current minutes, previous minutes, then ASA ID.

Every eligible explicit `Designated Player` and `U22 Initiative` designation is
also included. Productive players with five current-season goals plus primary assists
are also included; this is intentionally attacker-biased so the base quota does
not omit them. ASA does not expose player starts in the normalized endpoints;
minutes share is not treated as an equivalent automatic inclusion rule.

`data/comparison-pool-overrides.json` has `include` and `exclude` arrays of
`{ playerId, reason, sourceNote }`. IDs and explanation fields are required;
unknown, duplicate, or include/exclude-conflicting IDs fail validation.
Exclusions take precedence and inclusions receive `manual-inclusion`. The pool
must naturally be approximately 250–325 players (fewer than 150 or more than
325 fails validation); the audit labels overlapping reason counts.

Manual inclusions are reserved for rare, explainable exceptions such as verified
injury absences, major signings, stale-snapshot effects, or source-data errors,
not ordinary rotation players. The terminal demo starts every player at 1500 Elo, keeps all votes only in
memory, writes no state, and sends no data anywhere. The static browser app is
not changed by this temporary integration test.

## Browser use

The framework-free TypeScript browser interface loads the committed
`public/data/comparison-pool.json` through Vite as a static asset. It never calls
ASA or any other external API at runtime. Start it with `npm run dev:web`, build
it with `npm run build:web`, and run its focused tests with `npm run test:web`.

The browser pool remains an eligibility and involvement filter, not a
trade-value score. The personal Top 25 contains only players who have completed
at least one comparison and applies the shared deterministic Elo ranking rules.
If a player has no 2026 minutes, the card clearly labels its available 2025
statistics as a fallback rather than placing them under a 2026 heading.

Stores only mutable personal-ranking state in browser `localStorage`
under `daniel-mehta:mls-trade-value-elo:ranking-state` (schema version 2).
Refresh and reopening the same browser can restore Elo records, totals, and a
valid current matchup. Balanced matchup selection prioritizes under-compared
players, avoids recent repeated pairs and players, modestly favors relevant
pool metadata early, and gradually considers Elo similarity later. Scheduling
does not alter the Elo calculation. Only bounded cooldown history is stored;
full player data remains in this committed pool file and is never duplicated in
storage. Older saved rankings migrate while retaining valid records and totals.
The browser creates no backend session and has
no database, accounts, cookies, analytics, uploads, or synchronization. The
ranking is origin-specific, so development and production do not share it, and
clearing site data or using Reset ranking removes it.
Roster fields still reflect the static February 26, 2026 snapshot described
above, not current roster information.
