#!/usr/bin/env node
/**
 * Fetch Seahawks schedule + player season stats and write to src/data/nfl/
 *
 * Requires:
 *   BALLDONTLIE_API_KEY env var
 *
 * Usage:
 *   node scripts/fetch-nfl-data.mjs
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

const BASE = "https://api.balldontlie.io/v1";

// Seahawks NFL team id varies by provider. Your existing schedule file is already working,
// so we read it and derive team id if present; otherwise default to 27 (placeholder).
const DEFAULT_SEA_TEAM_ID = 27;

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
    throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}\n${txt}`);
  }

  return res.json();
}

function nowIso() {
  return new Date().toISOString();
}

function guessSeasonYearUTC() {
  // If it is Jan/Feb, you usually still want previous NFL season year for the season label.
  const d = new Date();
  const m = d.getUTCMonth() + 1;
  const y = d.getUTCFullYear();
  return m <= 2 ? y - 1 : y;
}

async function fetchSchedule(seaTeamId, seasonYear) {
  const candidates = [
    `${BASE}/nfl/games?team_ids[]=${seaTeamId}&seasons[]=${seasonYear}&per_page=100`,
    `${BASE}/nfl/games?team_ids[]=${seaTeamId}&season=${seasonYear}&per_page=100`,
  ];

  let lastErr = null;
  for (const url of candidates) {
    try {
      const json = await apiGet(url);
      return json;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("Failed to fetch schedule.");
}

async function fetchPlayerSeasonStats(seaTeamId, seasonYear) {
  const candidates = [
    `${BASE}/nfl/season_stats?team_ids[]=${seaTeamId}&seasons[]=${seasonYear}&per_page=200`,
    `${BASE}/nfl/player_season_stats?team_ids[]=${seaTeamId}&seasons[]=${seasonYear}&per_page=200`,
  ];

  let lastErr = null;
  for (const url of candidates) {
    try {
      const json = await apiGet(url);
      return json;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("Failed to fetch player season stats.");
}

function normalizeSchedule(raw, seasonYear) {
  const items = raw?.data ?? raw?.games ?? raw ?? [];
  return {
    updatedAt: nowIso(),
    season: seasonYear,
    games: items,
  };
}

function normalizePlayers(raw, seasonYear) {
  const items = raw?.data ?? raw?.players ?? raw ?? [];
  return {
    updatedAt: nowIso(),
    season: seasonYear,
    players: items,
  };
}

function readExistingSeahawksTeamId() {
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

async function main() {
  const seasonYear = guessSeasonYearUTC();

  const inferredTeamId = readExistingSeahawksTeamId();
  const seaTeamId = Number.isFinite(inferredTeamId) ? inferredTeamId : DEFAULT_SEA_TEAM_ID;

  console.log(`Using SEA team id: ${seaTeamId}`);
  console.log(`Using season year: ${seasonYear}`);

  // Schedule (best effort, do not block players if schedule fails)
  try {
    const rawSchedule = await fetchSchedule(seaTeamId, seasonYear);
    const outSchedule = normalizeSchedule(rawSchedule, seasonYear);
    writeJson("src/data/nfl/seahawks.json", outSchedule);
  } catch (e) {
    console.error("Schedule fetch failed:", e.message);
  }

  // Players (required)
  const rawPlayers = await fetchPlayerSeasonStats(seaTeamId, seasonYear);
  const outPlayers = normalizePlayers(rawPlayers, seasonYear);
  writeJson("src/data/nfl/players.json", outPlayers);

  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
