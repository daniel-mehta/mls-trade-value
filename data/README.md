# MLS player data artifacts

`public/data/players.json` is the normalized source artifact.
`public/data/comparison-pool.json` is a generated, browser-facing subset. The
browser never calls American Soccer Analysis (ASA) or another player-data
service at runtime.

## Source commands

The player pipeline consumes the public ASA endpoints for player identities and
positions, teams, player xGoals, xPass, outfield Goals Added, goalkeeper xGoals,
goalkeeper Goals Added, and salaries. No API key or paid service is required.

```sh
npm run probe:data
npm run probe:rosters
npm run build:data
npm run validate:data
npm run audit:rosters
npm run build:pool
npm run validate:pool
npm run audit:pool
npm run check:publication
```

`-- --refresh` bypasses the ignored `.cache/asa/` and `.cache/rosters/`
responses. A publication check never refreshes a source and never rewrites an
artifact. Salary acquisition is optional: a salary request can fail while the
statistical build succeeds, but the source and salary metadata must explicitly
record the unavailable state. Required identity, team, statistical, or roster
acquisition failures remain fatal.

Seasons default to 2026 and 2025 and can be configured for a build with
`MLS_CURRENT_SEASON` and `MLS_PREVIOUS_SEASON`. Roster candidate filenames are
selected for the configured current season. Parsed embedded snapshot dates,
not filename ordering, determine the latest release. Distinct candidates with
the same latest embedded date and different content fail as ambiguous.

## Semantic artifact identity

Schema version and semantic data version are separate concepts. Each artifact
contains:

```text
schemaVersion
humanReadableLabel
dataVersion
generatedAt
```

`humanReadableLabel` is descriptive. `dataVersion` is `sha256:` followed by a
SHA-256 digest of canonical substantive content. Canonical JSON sorts object
keys. Normalized records, source snapshots, and overrides are sorted by stable
identifiers before hashing; source row checksums sort canonical rows so API
response order and object-key order do not change identity.

The player digest includes schema, competition, seasons, normalized players,
canonical source checksums, salary and roster provenance, applied overrides,
normalization/team-selection policy, and deterministic audit metadata. The pool
digest includes the player version, pool schema, all eligibility/selection
rules and tie-breakers, manual overrides, final membership, embedded player
fields, and selection reasons.

`generatedAt`, source observation/retrieval timestamps, JSON indentation, cache
paths, local paths, logs, browser state, Elo values, and export times are
excluded. Changing only build time therefore preserves both semantic versions;
changing substantive source content, normalized data, an applied override,
pool rules, membership, or reasons changes the relevant version.

## Structured provenance

The player artifact records each consumed source separately with:

- Stable source ID and source type
- Endpoint or repository identity
- Season, where applicable
- Canonical SHA-256 content checksum
- Row count
- `available` or `optional-unavailable` status
- Retrieval time only when the cache has a trustworthy recorded acquisition
  time

Legacy caches have no trustworthy acquisition timestamp. They deliberately use
`retrievedAt: null`; artifact build time is not substituted.

Goalkeeper xGoals and Goalkeeper Goals Added are separate source snapshots for
each configured season. Their provenance entries retain the official endpoint,
season, canonical content checksum, row count, availability, and trustworthy
cache retrieval time when recorded. A publication-ready artifact requires both
goalkeeper source families for both configured seasons; missing or malformed
provenance does not silently become a playing-time-only publication artifact.

Salary provenance records acquisition status, selected season, selected MLSPA
release, USD currency, and selected-record count. It does not claim complete
salary coverage. Roster provenance separately records the repository, release
filename, file date, embedded snapshot date, checksum, team/raw record counts,
and matched/unmatched/ignored-duplicate accounting.

`statisticsThrough` is a separate nullable field. It remains `null` unless a
date is directly defensible from the source rows consumed by the build. Current
public copy therefore says: **Verified statistical coverage date not recorded.**

## Player normalization

- ASA player ID, team ID, and season are the only identity/join keys. Names are
  never silent fallback identifiers.
- Split player-team-season statistical components are additive and are summed.
- For a multi-team current season, displayed team is selected by current-season
  minutes, then previous-season minutes for the tied teams, then normalized ASA
  team ID. Source response order never decides.
- Observed general positions map explicitly: `GK` to GK; `CB`/`FB` to DEF;
  `AM`/`CM`/`DM` to MID; and `ST`/`W` to FWD. Unknown values are excluded and
  counted rather than guessed.
- Normalized-dataset eligibility requires complete identity/team/position plus
  at least one current- or previous-season minute. Salary is not required.
- Base salary and average guaranteed compensation remain distinct optional
  numeric fields. Multiple MLSPA releases are never summed. The latest valid
  player release is selected and conflicting rows at that release fail.
- Goalkeeper rows join only by ASA player ID and retain their season dimension.
  Additive xGoals-source totals are combined across team rows. Goalkeeper Goals
  Added is the exact sum of ASA's raw Claiming, Fielding, Handling, Passing,
  Shotstopping, and Sweeping components. Rates, shares, above-average values,
  and action counts are not summed or substituted into the player artifact.
  Missing components remain omitted, and goalkeeper metrics never replace the
  general displayed-team or playing-time policy.

Audit metadata persists source row counts, current- and cross-season multi-team
counts, unmatched salaries, unknown-position exclusions, roster accounting,
final statistical/snapshot team disagreements, applied overrides, player/team
counts, position distribution, and deterministic goalkeeper join/coverage
diagnostics. Goalkeeper diagnostics include raw rows by endpoint and season,
matched and unmatched IDs, duplicate rows, non-goalkeeper conflicts, seasonal
coverage, and playing-time-only counts. The disagreement count is recomputed
from the final attached and overridden players, so transient loan-pair
processing cannot alter it.

## Roster snapshot

Roster data comes from ASA's
[`mls-roster-profiles`](https://github.com/American-Soccer-Analysis/mls-roster-profiles)
repository. These are ASA-parsed roster-profile records whose upstream parser
maps source names to ASA IDs; downstream joins use only those ASA IDs. They are
not a live roster and should not be described as official current-team data.

Statistical team ID/name/abbreviation and snapshot team ID/name remain separate.
`activeAtRosterSnapshot` means listed, not marked unavailable, and not in the
explicit `Off-Roster (Unavailable)` slot. Available optional fields include
slot, designation, status, contract-through, option years, permanent-transfer
option, international status, TAM convertibility, unavailability, Canadian
exemption, and team roster-construction model. Missing booleans are omitted,
not converted to false.

Duplicate roster IDs are resolved only for a recognizable loan pair with
exactly one record matching the normalized statistical team. Any other
normalized duplicate fails rather than depending on response order.

## Strict roster overrides

`data/roster-overrides.json` remains an empty, checked-in correction mechanism.
Entries require a known ASA player ID, real calendar date, nonblank reason and
source note, and a non-empty supported `fields` object. Unknown top-level,
entry, or field keys fail. Player IDs must be unique.

Statistical team replacement requires the complete known `teamId`, `teamName`,
and `teamAbbreviation` tuple. Snapshot team replacement requires both the known
`snapshotTeamId` and matching `snapshotTeamName`. Invalid booleans, impossible
dates, unknown teams, malformed option-year arrays, and empty fields fail.
Omitted optional booleans remain omitted. Validated applied override content and
count participate in player semantic identity.

No override should be added merely to make a static artifact look current.

## Comparison-pool rules

The comparison pool is an eligibility and involvement filter, not a trade-value
model or ranking. Its rules remain:

- Eligible with a current-season minute, or with a previous-season minute when
  listed in the roster snapshot.
- Unavailable snapshot players are not automatically excluded.
- Per statistical team, include the top five eligible outfield players and top
  eligible goalkeeper by `current minutes + previous minutes * 0.5`.
- Participation ties use total score, current minutes, previous minutes, then
  ASA player ID.
- Include every eligible exact `Designated Player` and `U22 Initiative` record.
- Include every eligible player with at least five current-season goals plus
  primary assists.
- Exclusions take precedence.

`data/comparison-pool-overrides.json` has strict `include` and `exclude` arrays
of `{ playerId, reason, sourceNote }`. Unknown or duplicate IDs, include/exclude
conflicts, blank explanations, and extra properties fail. A manual inclusion is
still eligibility-bound: it can add a selection reason to an eligible player,
but cannot bypass the minute/roster eligibility rule for a no-minute signing.

Pool audit metadata records eligible count, final size, all non-exclusive reason
counts, position distribution, and team representation range. Pool validation
always loads the player artifact and then:

1. Validates the source artifact and semantic version.
2. Recomputes eligibility, selection, reasons, audit metadata, and pool version.
3. Compares every embedded selected record with its normalized source player.
4. Rejects missing/extra players, altered fields, rule drift, reason drift,
   source-version drift, and semantic-version drift.

## Browser, persistence, and exports

The browser validates schema version 3 pool metadata and consumes artifact
provenance rather than hard-coded dates. It separately labels pool build time,
unverified or verified statistical coverage, roster snapshot and release-file
dates, and salary release/currency. Missing metadata uses field-specific honest
fallbacks.

Personal ranking state remains in one browser `localStorage` key at schema
version 2. Only stable IDs, ratings, records, totals, matchup state, and bounded
scheduler history are stored. A semantic data-version change preserves ratings
and records for returning IDs, adds new IDs unranked, drops removed IDs, filters
history, and repairs invalid matchups. Elo and scheduler policy are unchanged.

CSV ranking rows are unchanged. TXT and JSON exports distinguish export time,
player and pool artifact build times and versions, verified coverage, roster
dates, and salary release/currency. JSON export format version 2 reflects this
incompatible public metadata-schema change. Exports remain browser-only and are
not import files.

Goalkeeper cards use the official ASA goalkeeper xGoals and Goalkeeper Goals
Added source families. The normalized goalkeeper structure keeps current and
previous seasons separate and may contain shots faced, goals conceded, saves,
xG faced, goals minus xG faced, raw Goalkeeper Goals Added, and its six raw
action components. The compact card shows at most minutes, saves, shots faced,
xG faced, goals minus xG faced, and total Goalkeeper Goals Added. Availability
varies by season and player; missing fields are omitted, and no metrics are
fabricated or zero-filled.

These are static source snapshots. Artifact build time is not a verified
statistics-through date, and the artifact continues to record
`statisticsThrough: null` where direct source evidence is absent. Goalkeeper
metrics do not directly affect Elo or comparison-pool selection. Pool rules are
unchanged, and Elo continues to reflect the user's pairwise choices rather than
any ASA performance metric.

## Publication and attribution

`npm run check:publication` validates both artifacts without rebuilding them or
refreshing any source. The production web build runs this command before Vite.
There is no deployment workflow in this repository yet.

This project is independent and is not affiliated with or endorsed by MLS,
MLSPA, ASA, any club, or any player. Repository code licences do not establish a
licence or legal approval to redistribute underlying source data. Review current
terms and attribution requirements before publishing an artifact.
