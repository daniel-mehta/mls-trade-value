# MLS player data snapshot

`public/data/players.json` is a generated static snapshot for the browser. The
browser must never call American Soccer Analysis (ASA) directly.

## Source and commands

The sole Phase 2A source is ASA's free public API: `GET /mls/players`,
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
  roster/manual-override phase.
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
