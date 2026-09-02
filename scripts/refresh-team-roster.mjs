#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rosterFreshness } from "../src/lib/roster.mjs";
import { DEFAULT_ROSTER_SOURCE, refreshRoster } from "../src/lib/roster-refresh.mjs";
import { transactionRosterMismatches } from "../src/lib/team-updates-core.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = path.join(root, "src/data/team/roster.json");
const result = await refreshRoster({
  file,
  sourceUrl: process.env.SEAHAWKS_ROSTER_URL || DEFAULT_ROSTER_SOURCE,
  allowLargeChange: process.argv.includes("--allow-large-change"),
});
const freshness = rosterFreshness(result.store);
if (freshness.stale) console.warn(`WARNING: ${freshness.message}`);
const transactionFile = path.join(root, "src/data/team/transactions.json");
const transactionStore = JSON.parse(await fs.promises.readFile(transactionFile, "utf8"));
const mismatches = transactionRosterMismatches(transactionStore, result.store);
if (mismatches.length) {
  console.warn(`WARNING: roster refresh conflicts with ${mismatches.length} latest transaction status(es): ${mismatches.map((row) => `${row.playerName || row.playerId} expected ${row.expected}, found ${row.actual}`).join("; ")}`);
}
