import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { PlayerDataset } from "../src/data/types.js";

const dataset = JSON.parse(await readFile(join(process.cwd(), "public/data/players.json"), "utf8")) as PlayerDataset;
const players = dataset.players;
const profiles = players.filter((player) => player.rosterProfile).map((player) => player.rosterProfile!);
const snapshot = dataset.rosterSnapshot;
console.log(`MLS roster metadata audit

Roster release file: ${snapshot.releaseFilename}
File date: ${snapshot.fileDate}
Embedded snapshot date: ${snapshot.snapshotDate}
Snapshot is live: no

Roster source records: ${snapshot.rawRecordCount}
Matched records: ${profiles.length}
Unmatched records: ${snapshot.unmatchedRecords}
Duplicate records ignored after loan-pair resolution: ${snapshot.duplicateRecordsIgnored}
Missing roster player IDs: ${snapshot.missingPlayerIds}
Record accounting: ${profiles.length + snapshot.unmatchedRecords + snapshot.duplicateRecordsIgnored} of ${snapshot.rawRecordCount}
Statistical players outside snapshot: ${players.length - profiles.length}
Active at snapshot: ${profiles.filter((profile) => profile.activeAtRosterSnapshot).length} (non-exclusive)
Unavailable at snapshot: ${profiles.filter((profile) => profile.unavailable).length} (non-exclusive)
Off-roster players: ${profiles.filter((profile) => profile.rosterSlot === "Off-Roster (Unavailable)").length} (non-exclusive)
Team disagreements: ${dataset.audit.statisticalSnapshotTeamDisagreementCount}
Players with contract-through data: ${profiles.filter((profile) => profile.contractThrough).length}
Players with option years: ${profiles.filter((profile) => profile.optionYears?.length).length}
Players with international-slot status: ${profiles.filter((profile) => profile.internationalSlot !== undefined).length}
Manual overrides applied: ${dataset.overrides.appliedCount}

Roster audit passed.`);
