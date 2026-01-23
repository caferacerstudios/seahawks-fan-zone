#!/usr/bin/env node
/**
 * Fetch Seahawks schedule + player season stats and write to src/data/nfl/
 *
 * Requires:
 *   BALLDONTLIE_API_KEY env var
 *
 * Usage:
 *   node scripts/fetch-nfl.mjs
 */

import fs from "node:fs";
import path from "node:path";

const API_KEY = process.env.BALLDONTLIE_API_KEY;

if (!API_KEY) {
  console.error("Missing BALLDONTLIE_API_KEY env var.");
  process.exit(1);
}

const OUT_DIR = path.resolve(process.cwd(), "src/data/nfl");
fs.mkdirSync(OUT_DIR, { recursive: true });

// NFL endpoints are under /nfl/v1
const NFL_BASE = "https://api.balldontlie.io/nfl/v1";

function writeJson(relPath, obj) {
  const full = path.resolve(process.cwd(), relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, JSON.stringify(obj, null, 2));
  console.log(`wrote ${relPath}`);
}

async function apiGet(url) {
  const res = await fetch(url, {
    headers: {
      Authorization: API_KEY,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    const err = new Error(`HTTP ${res.status} ${res.statusText} for ${url}\n${txt}`);
    err.status = res.status;
    err.body = txt;
    throw err;
  }

  return res.json();
}

function nowIso() {
  return new Date().toISOString();
}

function guessSeasonYearUTC() {
  // In Jan/Feb, most people mean the prior NFL season year.
  const d = new Date();
  const m = d.getUTCMonth() + 1;
  const y = d.getUTCFullYear();
  return m <= 2 ? y - 1 : y;
}

function readExistingSeaTeamId() {
  const p = path.resolve(process.cwd(), "src/data/nfl/seahawks.json");
  if (!fs.existsSync(p)) return null;

  try {
    const j = JSON.parse(fs.readFileSync(p, "utf-8"));
    const maybe = j?.teamId ?? j?.team_id ?? j?.seaTeamId;
    if (maybe) return Number(maybe);

    const g = (j?.games || [])[0];
    const home = g?.home_team;
    const away = g?.visitor_team;
    if (home?.abbreviation?.toUpperCase() === "SEA" && home?.id) return Number(home.id);
    if (away?.abbreviation?.toUpperCase() === "SEA" && away?.id) return Number(away.id);
  } catch {
    return null;
  }

  return null;
}

async function fetchTeams() {
  return apiGet(`${NFL_BASE}/teams?per_page=100`);
}

async function fetchSchedule(seaTeamId, seasonYear) {
  // If /games uses different params on your tier, we can adjust, but keep as-is for now.
  // per_page max is 100.
  const url =
    `${NFL_BASE}/games?` +
    `team_ids[]=${encodeURIComponent(seaTeamId)}` +
    `&season=${encodeURIComponent(seasonYear)}` +
    `&per_page=100`;

  return apiGet(url);
}

async function fetchPlayerSeasonStats(seaTeamId, seasonYear) {
  // The API error told us:
  // - expects season= (singular)
  // - per_page max is 100
  const url =
    `${NFL_BASE}/season_stats?` +
    `team_ids[]=${encodeURIComponent(seaTeamId)}` +
    `&season=${encodeURIComponent(seasonYear)}` +
    `&per_page=100`;

  return apiGet(url);
}

function normalizeSchedule(raw, seasonYear, seaTeamId) {
  const items = raw?.data ?? [];
  return {
    updatedAt: nowIso(),
    season: seasonYear,
    teamId: seaTeamId,
    games: items,
  };
}

function normalizePlayers(raw, seasonYear, seaTeamId) {
  const items = raw?.data ?? [];
  return {
    updatedAt: nowIso(),
    season: seasonYear,
    teamId: seaTeamId,
    players: items,
  };
}

async function main() {
  const seasonYear = guessSeasonYearUTC();

  // Auth sanity check
  await fetchTeams();

  // Choose SEA team id
  let seaTeamId = readExistingSeaTeamId();

  if (!Number.isFinite(seaTeamId)) {
    const teamsJson = await fetchTeams();
    const teams = teamsJson?.data ?? [];
    const sea = teams.find((t) => String(t.abbreviation).toUpperCase() === "SEA");
    seaTeamId = sea?.id;
  }

  if (!Number.isFinite(seaTeamId)) {
    console.error("Could not determine SEA team id from /teams.");
    process.exit(1);
  }

  console.log(`Using SEA team id: ${seaTeamId}`);
  console.log(`Using season year: ${seasonYear}`);

  // Schedule
  try {
    const rawSchedule = await fetchSchedule(seaTeamId, seasonYear);
    const outSchedule = normalizeSchedule(rawSchedule, seasonYear, seaTeamId);
    writeJson("src/data/nfl/seahawks.json", outSchedule);
  } catch (e) {
    console.error("Schedule fetch failed:", e.message);
    if (!fs.existsSync(path.resolve(process.cwd(), "src/data/nfl/seahawks.json"))) {
      writeJson("src/data/nfl/seahawks.json", {
        updatedAt: nowIso(),
        season: seasonYear,
        teamId: seaTeamId,
        games: [],
        error: "schedule_fetch_failed",
      });
    }
  }

  // Players
  try {
    const rawPlayers = await fetchPlayerSeasonStats(seaTeamId, seasonYear);
    const outPlayers = normalizePlayers(rawPlayers, seasonYear, seaTeamId);
    writeJson("src/data/nfl/players.json", outPlayers);
  } catch (e) {
    console.error("Player season stats fetch failed:", e.message);
    writeJson("src/data/nfl/players.json", {
      updatedAt: nowIso(),
      season: seasonYear,
      teamId: seaTeamId,
      players: [],
      error: "player_fetch_failed",
    });

    // Hard fail on non-401? You can decide. Keeping build alive:
    // process.exit(1);
  }

  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
