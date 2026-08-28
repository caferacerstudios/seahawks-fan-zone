import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { currentRosterPlayers, duplicateCurrentPlayerIds, filterRosterByStatus, rosterCount } from "../src/lib/roster.mjs";
import { newestFirst } from "../src/lib/team-updates-core.mjs";

const read = (path) => JSON.parse(fs.readFileSync(new URL(path, import.meta.url), "utf8"));
const roster = read("../src/data/team/roster.json");
const transactions = read("../src/data/team/transactions.json");

test("official roster snapshot count excludes reserve and historical records", () => {
  assert.equal(rosterCount(roster), 91);
  assert.equal(currentRosterPlayers(roster).length, 91);
  assert.equal(filterRosterByStatus(roster, "Reserve/Injured").length, 4);
});

test("current roster has no duplicate player identities", () => {
  assert.deepEqual(duplicateCurrentPlayerIds(roster), []);
});

test("status filtering does not treat historical records as current", () => {
  const fixture = { players: [...roster.players, { id: "old", status: "Historical" }] };
  assert.equal(rosterCount(fixture), 91);
  assert.equal(filterRosterByStatus(fixture, "Historical").length, 1);
});

test("transactions sort newest first without mutating imported order", () => {
  const original = transactions.records.map((row) => row.timestamp);
  const sorted = newestFirst(transactions.records, (row) => row.timestamp);
  assert.deepEqual(transactions.records.map((row) => row.timestamp), original);
  for (let index = 1; index < sorted.length; index++) {
    assert.ok(Date.parse(sorted[index - 1].timestamp) >= Date.parse(sorted[index].timestamp));
  }
});
