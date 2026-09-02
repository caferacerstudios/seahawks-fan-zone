export function newestFirst(rows, dateOf) {
  return rows.slice().sort((a, b) => Date.parse(dateOf(b)) - Date.parse(dateOf(a)));
}

const EXPECTED_ROSTER_STATUS = new Map([
  ["Signed", "Active"], ["Claimed", "Active"], ["Practice Squad", "Practice Squad"],
  ["Injured Reserve", "Reserve/Injured"], ["PUP", "PUP"],
  ["Waived", "Waived"], ["Released", "Released"],
]);
const ROSTER_STATUS_VALUES = new Set(["Active", "Practice Squad", "Reserve/Injured", "PUP", "Commissioner Exempt", "Released", "Waived", "Historical"]);

export function transactionFreshness(store, now = new Date()) {
  const checkedAt = now instanceof Date ? now : new Date(now);
  const asOf = new Date(store?.asOf);
  if (!Number.isFinite(checkedAt.getTime()) || !Number.isFinite(asOf.getTime())) {
    return { stale: true, ageDays: null, maxAgeDays: 0, message: "Transaction freshness is unknown because asOf is missing or invalid." };
  }
  const month = checkedAt.getUTCMonth() + 1;
  const maxAgeDays = month >= 8 || month <= 2 ? 3 : 30;
  const ageDays = Math.max(0, (checkedAt.getTime() - asOf.getTime()) / 86_400_000);
  return {
    stale: ageDays > maxAgeDays,
    ageDays,
    maxAgeDays,
    message: ageDays > maxAgeDays
      ? `Transaction data is ${Math.floor(ageDays)} days old; this is the last successfully verified update, not a complete current record.`
      : `Transactions verified through ${asOf.toISOString()}.`,
  };
}

export function transactionRosterMismatches(transactionStore, rosterStore) {
  const latest = new Map();
  for (const row of newestFirst(transactionStore?.records || [], (record) => record.timestamp)) {
    const key = String(row.playerId ?? "");
    if (key && !latest.has(key)) latest.set(key, row);
  }
  const roster = new Map((rosterStore?.players || []).map((player) => [String(player.id), player]));
  const mismatches = [];
  for (const [playerId, row] of latest) {
    const expected = (ROSTER_STATUS_VALUES.has(row.newStatus) ? row.newStatus : null) || EXPECTED_ROSTER_STATUS.get(row.transactionType)
      || (["Trade", "Elevated"].includes(row.transactionType) ? row.newStatus : null);
    if (!expected) continue;
    const actual = roster.get(playerId)?.status || "Absent";
    if (actual !== expected) mismatches.push({ playerId, playerName: row.playerName, expected, actual, transactionType: row.transactionType });
  }
  return mismatches;
}
