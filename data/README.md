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

## Phase 2B roster snapshot

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
