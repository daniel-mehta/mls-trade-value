import type { PositionGroup } from "./types.js";

/** ASA currently describes broad positions as these values.  Keep this map
 * explicit: a new ASA value must be reviewed rather than guessed at. */
const POSITION_MAP: Record<string, PositionGroup> = {
  GK: "GK", Goalkeeper: "GK",
  D: "DEF", DEF: "DEF", DF: "DEF", CB: "DEF", FB: "DEF", Defender: "DEF",
  M: "MID", MID: "MID", CM: "MID", DM: "MID", AM: "MID", Midfielder: "MID",
  F: "FWD", FW: "FWD", FWD: "FWD", ST: "FWD", W: "FWD", Forward: "FWD",
};

export function normalizePosition(value: unknown): PositionGroup | undefined {
  if (typeof value !== "string") return undefined;
  return POSITION_MAP[value.trim()] ?? POSITION_MAP[value.trim().toUpperCase()];
}

export function requirePosition(value: unknown): PositionGroup {
  const result = normalizePosition(value);
  if (!result) throw new Error(`Unrecognized ASA position value: ${String(value)}`);
  return result;
}

export const observedPositionMappings = POSITION_MAP;
