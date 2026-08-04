# Data Notice

This project uses static generated MLS player artifacts. Player statistics and
salary rows come from the public American Soccer Analysis (ASA) API. Roster,
designation, status, contract, and option fields come from ASA's parsed copy of
MLS club roster profiles. ASA's parser maps those source records to ASA player
IDs; the resulting mappings remain subject to source and parser limitations.

The browser reads only the committed comparison-pool artifact. It does not call
ASA, MLS, MLSPA, a club, or another player-data service during normal use.

Artifact build time is not a statistics-through date. The current artifacts do
not contain direct defensible evidence of a verified statistical coverage date,
so they state `statisticsThrough: null` and the browser says that verified
statistical coverage was not recorded. Statistics, transfers, injuries, and
roster changes do not update automatically.

Salary acquisition is optional. A build can succeed without salary data and
must then record the salary source as unavailable. When salary data is present,
releases are never summed: the latest valid player release is selected. The
artifact records the selected MLSPA release, USD currency, selected-record
count, and incomplete coverage explicitly. Salary does not determine pool
eligibility, matchup prominence, Elo, or personal ranking.

The displayed club is the statistical team chosen by current-season minutes,
then previous-season minutes, then normalized ASA team ID. It can differ from
the separately retained dated roster-snapshot team. Missing optional values are
omitted; absence does not mean zero or false.

Goalkeeper cards currently contain playing time only. Saves, goals conceded,
expected-goals-against, and goalkeeper Goals Added are not included in these
artifacts. Goalkeeper source integration is planned as separate work and no
derived or fabricated goalkeeper metrics are substituted.

This independent project is not affiliated with or endorsed by MLS, MLSPA,
American Soccer Analysis, any club, or any player. Repository code licensing
does not establish a licence or legal approval to redistribute the underlying
source data. Review current source terms and attribution requirements before
publishing or redistributing an artifact.
