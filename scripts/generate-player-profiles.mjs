#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { playerProfilesArtifactPath, readPlayerProfiles } from "../src/lib/player-profiles.mjs";
import { runPlayerProfileGeneration } from "../src/lib/player-profile-generation.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));

async function main() {
  const nflData = read("src/data/nfl/seahawks.json");
  const playersData = read("src/data/nfl/players.json");
  const artifactPath = playerProfilesArtifactPath();
  const summary = await runPlayerProfileGeneration({
    rosterStore: read("src/data/team/roster.json"),
    nflData,
    playerDirectory: playersData.playerDirectory || nflData.playerDirectory || [],
    existingArtifact: readPlayerProfiles({ allowFixture: true }).data,
    artifactPath,
    ledgerPath: path.join(path.dirname(artifactPath), "usage-ledger.json"),
    lockPath: path.join(path.dirname(artifactPath), "generation.lock"),
  });
  console.log("Player-profile generator summary (this ledger covers only this generator):");
  console.log(`Roster records considered: ${summary.considered}`);
  console.log(`Profiles already current: ${summary.current}`);
  console.log(`Profiles generated: ${summary.generated}`);
  console.log(`Profiles skipped because data was insufficient: ${summary.insufficient}`);
  console.log(`Profiles preserved after errors or limits: ${summary.preserved}`);
  console.log(`Requests made: ${summary.requests}`);
  console.log(`Input tokens: ${summary.inputTokens}; output tokens: ${summary.outputTokens}`);
  console.log(`Estimated run cost: $${summary.estimatedRunCostUsd.toFixed(4)}`);
  console.log(`Estimated profile-generator monthly cost: $${summary.monthlyCostUsd.toFixed(4)}`);
  console.log(`Remaining configured monthly budget: $${summary.remainingMonthlyBudgetUsd.toFixed(4)}`);
}

main().catch((error) => { console.error(error?.message || String(error)); process.exitCode = 1; });
