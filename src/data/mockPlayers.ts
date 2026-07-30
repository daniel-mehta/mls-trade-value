import type { Player } from "../domain/types.js";

/** Fictional players only; real MLS data is deliberately outside Phase 1. */
export const mockPlayers: Player[] = [
  { id: "aria-bennett", name: "Aria Bennett", team: "ATL", position: "FWD" },
  { id: "mateo-cardenas", name: "Mateo Cardenas", team: "AUS", position: "MID" },
  { id: "devon-cho", name: "Devon Cho", team: "CLB", position: "DEF" },
  { id: "imani-diallo", name: "Imani Diallo", team: "CIN", position: "MID" },
  { id: "felix-estrada", name: "Felix Estrada", team: "DAL", position: "FWD" },
  { id: "grace-farrell", name: "Grace Farrell", team: "HOU", position: "GK" },
  { id: "nico-gallardo", name: "Nico Gallardo", team: "LA", position: "DEF" },
  { id: "harper-ibrahim", name: "Harper Ibrahim", team: "MIA", position: "MID" },
  { id: "jonah-kim", name: "Jonah Kim", team: "NYC", position: "FWD" },
  { id: "lina-morales", name: "Lina Morales", team: "POR", position: "DEF" },
];
