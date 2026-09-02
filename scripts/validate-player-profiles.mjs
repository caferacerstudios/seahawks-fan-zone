#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { readPlayerProfiles } from "../src/lib/player-profiles.mjs";
import { isCurrentRosterPlayer } from "../src/lib/roster.mjs";

const production = process.argv.includes("--production");
const checkDist = process.argv.includes("--dist");
const root = process.cwd();
const roster = JSON.parse(fs.readFileSync(path.join(root, "src/data/team/roster.json"), "utf8"));
const currentIds = (roster?.players || []).filter(isCurrentRosterPlayer).map((player) => String(player.id));
const { profiles, inputPath, usedFixture } = readPlayerProfiles({ allowFixture: !production });
const profileIds = Object.keys(profiles).map(String);
const currentBios = currentIds.filter((id) => String(profiles[id]?.bio || "").trim());

if (production && usedFixture) throw new Error("Production player-profile validation refused the repository fixture.");
if (production && currentIds.length > 0 && currentBios.length === 0) throw new Error(`Production player profile artifact contains zero biographies for the current roster: ${inputPath}`);

let playerPages = 0;
let biosRendered = 0;
if (checkDist) {
  const playersRoot = path.join(root, "dist/players");
  if (!fs.existsSync(playersRoot)) throw new Error(`Player output directory is missing: ${playersRoot}`);
  for (const entry of fs.readdirSync(playersRoot, { withFileTypes: true })) {
    const htmlPath = path.join(playersRoot, entry.name, "index.html");
    if (!entry.isDirectory() || !fs.existsSync(htmlPath)) continue;
    playerPages++;
    const html = fs.readFileSync(htmlPath, "utf8");
    if (!html.includes("No verified biography is available in the current player data.")) biosRendered++;
  }
  if (production && profileIds.length > 0 && biosRendered === 0) throw new Error("Production build rendered zero player biographies from a non-empty artifact.");
}

console.log(`Player profiles loaded: ${profileIds.length} (${path.relative(root, inputPath)})`);
console.log(`Current-roster player bios loaded: ${currentBios.length}`);
if (checkDist) {
  console.log(`Player bios rendered: ${biosRendered}`);
  console.log(`Player pages generated: ${playerPages}`);
}
