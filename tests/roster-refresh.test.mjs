import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  identityKey,
  parseOfficialRoster,
  reconcileRoster,
  refreshRoster,
  validateRosterRefresh,
} from "../src/lib/roster-refresh.mjs";
import { rosterFreshness } from "../src/lib/roster.mjs";

const previous = {
  schemaVersion: 1,
  season: 2026,
  asOf: "2026-09-01T00:00:00.000Z",
  players: [
    { id: "kenny-mcintosh", name: "Kenny McIntosh", position: "RB", number: 25, status: "Active" },
    { id: "john-smith-jr", name: "John Smith Jr.", position: "WR", number: 10, status: "Active" },
    { id: "old-player", name: "Old Player", position: "T", number: 70, status: "Active" },
  ],
};

function source(players) {
  return JSON.stringify({ roster: { players } });
}

test("successful refresh normalizes practice squad and preserves stable IDs", () => {
  const fetched = parseOfficialRoster(source([
    { fullName: "Kenny McIntosh", position: "RB", jerseyNumber: "25", status: "Active" },
    { fullName: "John Smith, Jr.", position: "WR", jerseyNumber: 10, status: "Practice-Squad" },
  ]), "application/json");
  const next = reconcileRoster(previous, fetched, { now: new Date("2026-09-02T12:00:00Z") });
  assert.equal(next.asOf, "2026-09-02T12:00:00.000Z");
  assert.deepEqual(next.players.slice(0, 2).map(({ id, status }) => ({ id, status })), [
    { id: "kenny-mcintosh", status: "Active" },
    { id: "john-smith-jr", status: "Practice Squad" },
  ]);
  assert.equal(next.players.find((player) => player.id === "old-player").status, "Historical");
  assert.equal(identityKey("John Smith, Jr."), identityKey("John Smith Jr"));
});

test("grouped official payloads retain every supported roster section", () => {
  const fetched = parseOfficialRoster(JSON.stringify({ roster: {
    active: [{ name: "Active Player", position: "QB", number: 1 }],
    practiceSquad: [{ name: "Squad Player", position: "WR", number: 2, status: "practice squad" }],
    "reserve/injured": [{ name: "Reserve Player", position: "T", number: 3 }],
  } }), "application/json");
  assert.deepEqual(fetched.map((player) => player.status).sort(), ["Active", "Practice Squad", "Reserve/Injured"].sort());
});

test("duplicate source identities cannot create duplicate current players", () => {
  const fetched = parseOfficialRoster(source([
    { name: "John Smith Jr.", position: "WR", status: "Active" },
    { name: "John Smith, Jr", position: "WR", status: "Active" },
  ]), "application/json");
  assert.equal(fetched.length, 1);
  assert.equal(reconcileRoster(previous, fetched).players.filter((player) => player.status === "Active").length, 1);
});

test("empty, unknown-status, oversized, and dramatic refreshes are rejected", () => {
  assert.throws(() => parseOfficialRoster(source([]), "application/json"), /no recognizable player/);
  assert.throws(() => validateRosterRefresh({ players: [{ id: "x", status: "Mystery" }] }), /zero current players.*unknown statuses/);
  assert.throws(() => validateRosterRefresh({ players: [{ id: "x", status: "Active" }, { id: "x", status: "Practice Squad" }] }), /duplicate current IDs/);
  assert.throws(() => validateRosterRefresh({ players: Array.from({ length: 91 }, (_, id) => ({ id: String(id), status: "Active" })) }), /implausibly large/);
  const old = { players: Array.from({ length: 60 }, (_, id) => ({ id: String(id), status: "Active" })) };
  const next = { players: Array.from({ length: 30 }, (_, id) => ({ id: String(id), status: "Active" })) };
  assert.throws(() => validateRosterRefresh(next, old), /dramatic roster-count change/);
});

test("source failure preserves the previous artifact byte-for-byte", async () => {
  const directory = fs.mkdtempSync(path.join(process.cwd(), ".roster-refresh-test-"));
  const file = path.join(directory, "roster.json");
  const original = `${JSON.stringify(previous, null, 2)}\n`;
  fs.writeFileSync(file, original);
  const warnings = [];
  try {
    const result = await refreshRoster({ file, fetchImpl: async () => { throw new Error("offline"); }, warn: (message) => warnings.push(message) });
    assert.equal(result.updated, false);
    assert.equal(fs.readFileSync(file, "utf8"), original);
    assert.match(warnings[0], /preserving last known valid artifact.*offline/);
  } finally {
    fs.rmSync(directory, { recursive: true });
  }
});

test("successful refresh writes valid data atomically", async () => {
  const directory = fs.mkdtempSync(path.join(process.cwd(), ".roster-refresh-test-"));
  const file = path.join(directory, "roster.json");
  fs.writeFileSync(file, JSON.stringify(previous));
  try {
    const responseBody = source([
      { name: "Kenny McIntosh", position: "RB", number: 25, status: "active" },
      { name: "John Smith Jr", position: "WR", number: 10, status: "practice squad" },
    ]);
    const result = await refreshRoster({
      file,
      now: new Date("2026-09-02T12:00:00Z"),
      allowLargeChange: true,
      fetchImpl: async () => ({ ok: true, headers: { get: () => "application/json" }, text: async () => responseBody }),
      log: () => {},
    });
    assert.equal(result.updated, true);
    assert.equal(JSON.parse(fs.readFileSync(file, "utf8")).asOf, "2026-09-02T12:00:00.000Z");
    assert.deepEqual(fs.readdirSync(directory), ["roster.json"]);
  } finally {
    fs.rmSync(directory, { recursive: true });
  }
});

test("freshness reports active-season staleness without invalidating the roster", () => {
  assert.equal(rosterFreshness(previous, new Date("2026-09-03T00:00:00Z")).stale, false);
  const stale = rosterFreshness(previous, new Date("2026-09-08T00:00:00Z"));
  assert.equal(stale.stale, true);
  assert.match(stale.message, /last known valid roster/);
  assert.equal(rosterFreshness({ ...previous, asOf: "invalid" }).stale, true);
});
