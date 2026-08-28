export const ROSTER_STATUSES = ["Active", "Reserve/Injured", "PUP", "Practice Squad", "Waived", "Historical"];

const id = (player) => String(player?.id ?? player?.playerId ?? "").trim();

export function currentRosterPlayers(store) {
  const rows = Array.isArray(store?.players) ? store.players : [];
  return rows.filter((player) => player.status === "Active");
}

export function reserveRosterPlayers(store) {
  const rows = Array.isArray(store?.players) ? store.players : [];
  return rows.filter((player) => ["Reserve/Injured", "PUP"].includes(player.status));
}

export function rosterCount(store) {
  return new Set(currentRosterPlayers(store).map(id).filter(Boolean)).size;
}

export function duplicateCurrentPlayerIds(store) {
  const seen = new Set();
  const duplicates = new Set();
  for (const player of currentRosterPlayers(store)) {
    const key = id(player);
    if (!key) continue;
    if (seen.has(key)) duplicates.add(key);
    seen.add(key);
  }
  return [...duplicates];
}

export function filterRosterByStatus(store, statuses) {
  const allowed = new Set(Array.isArray(statuses) ? statuses : [statuses]);
  return (Array.isArray(store?.players) ? store.players : []).filter((player) => allowed.has(player.status));
}
