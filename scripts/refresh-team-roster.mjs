#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rosterFreshness } from "../src/lib/roster.mjs";
import { DEFAULT_ROSTER_SOURCE, refreshRoster } from "../src/lib/roster-refresh.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = path.join(root, "src/data/team/roster.json");
const result = await refreshRoster({
  file,
  sourceUrl: process.env.SEAHAWKS_ROSTER_URL || DEFAULT_ROSTER_SOURCE,
  allowLargeChange: process.argv.includes("--allow-large-change"),
});
const freshness = rosterFreshness(result.store);
if (freshness.stale) console.warn(`WARNING: ${freshness.message}`);
