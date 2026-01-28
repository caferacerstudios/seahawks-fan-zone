#!/usr/bin/env node
/**
 * Fetch Seahawks season schedule + season stats, enrich stats with player names,
 * AND fetch league standings for the same season.
 *
 * Writes:
 * - src/data/nfl/seahawks.json    (combined payload: schedule + enriched season stats)
 * - src/data/nfl/players.json     (enriched season stats only, for convenience)
 * - src/data/nfl/standings.json   (league standings for season)
 *
 * Requirements:
 * - env BALLDONTLIE_API_KEY must be set
 *
 * Optional:
 * - env NFL_TEAM_ABBR (default "SEA")
 * - env NFL_SEASON (default: current year - 1; Jan 2026 -> 2025)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_BASE = "https://api.balldontlie.io/nfl/v1";

const TEAM_ABBR = (process.env.NFL_TEAM_ABBR || "SEA").toUpperCase();
const SEASON = Number(process.env.NFL_SEASON) || new Date().getUTCFullYear() - 1;

const API_KEY = process.env.BALLDONTLIE_API_KEY;
if (!API_KEY) {
  console.error("Missing BALLDONTLIE_API_KEY env var.");
  process.exit(1);
}

// Your curl used: -H "Authorization: $BALLDONTLIE_API_KEY"
function authHeaderValue() {
  // If user already stored "Bearer xxx", keep it.
  if (API_KEY.toLowerCase().startsWith("bearer ")) return API_KEY;
  return API_KEY;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function apiGet(endpoint, params = {}) {
  const url = new URL(API_BASE + endpoint);

  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;

    // allow arrays for exploded params: seasons[] / team_ids[] / weeks[]
    if (Array.isArray(v)) {
      for (const item of v) url.searchParams.append(k, String(item));
      continue;
    }

    url.searchParams.set(k, String(v));
  }

  const res = await fetch(url.toString(), {
    headers: { Authorization: authHeaderValue() },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const msg = `HTTP ${res.status} ${res.statusText} for ${url}\n${body}`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }

  return res.json();
}

async function pagedGet(endpoint, baseParams = {}) {
  const all = [];
  let cursor = null;
  const perPage = 100;

  for (;;) {
    const params = { ...baseParams };
    if (cursor) params.cursor = cursor;

    let json;
    try {
      json = await apiGet(endpoint, { ...params, per_page: perPage });
    } catch (e) {
      if (
        String(e.message || "").includes("per_page") ||
        String(e.message || "").includes("Bad Request")
      ) {
        json = await apiGet(endpoint, params);
      } else {
        throw e;
      }
    }

    const data = Array.isArray(json?.data) ? json.data : [];
    all.push(...data);

    const next = json?.meta?.next_cursor || null;
    if (!next) break;

    cursor = next;
    await sleep(120);
  }

  return all;
}

function safeWriteJson(filePath, obj) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });

  const tmp = filePath + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + "\n");
  fs.renameSync(tmp, filePath);
}

function sortGamesChronologically(games) {
  return games.slice().sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

function assertNonEmptyArray(name, arr) {
  if (!Array.isArray(arr) || arr.length === 0) {
    throw new Error(`Refusing to write: ${name} is empty (fetch looks broken).`);
  }
}

async function main() {
  // 1) Find Seahawks team id
  const teams = await pagedGet("/teams", { per_page: 100 });
  const team = teams.find((t) => (t.abbreviation || "").toUpperCase() === TEAM_ABBR);

  if (!team) {
    console.error(`Could not find team with abbreviation ${TEAM_ABBR}`);
    process.exit(1);
  }

  console.log(`Using ${TEAM_ABBR} team id: ${team.id}`);
  console.log(`Using season year: ${SEASON}`);

  // 2) Fetch games for that season
  const games = await pagedGet("/games", {
    "team_ids[]": [team.id],
    "seasons[]": [SEASON],
  });

  const gamesFiltered = games.filter((g) => Number(g.season) === Number(SEASON));

  const gamesRegular = sortGamesChronologically(gamesFiltered.filter((g) => !g.postseason));
  const gamesPostseason = sortGamesChronologically(gamesFiltered.filter((g) => !!g.postseason));

  // 3) Fetch team player list (names/positions)
  const players = await pagedGet("/players", { "team_ids[]": [team.id] });
  const playersById = new Map(players.map((p) => [p.id, p]));

  // 4) Fetch season stats for this team + season
  const seasonStatsRegular = await pagedGet("/season_stats", {
    season: SEASON,
    team_id: team.id,
    postseason: false,
  });

  const seasonStatsPostseason = await pagedGet("/season_stats", {
    season: SEASON,
    team_id: team.id,
    postseason: true,
  });

  const seasonStatsAll = [...seasonStatsRegular, ...seasonStatsPostseason];

  const enriched = seasonStatsAll.map((row) => {
    const playerId = row.player_id ?? row.player?.id ?? row.playerId ?? null;
    const player = playerId ? playersById.get(playerId) : (row.player || null);

    return {
      ...row,
      player: player || null,
      player_id: playerId || row.player_id || null,
      team_id: row.team_id ?? team.id,
      season: row.season ?? SEASON,
    };
  });

  // 5) Fetch full league standings for this season
  // Docs: GET /nfl/v1/standings?season=YYYY
  const standingsJson = await apiGet("/standings", { season: SEASON });
  const standings = Array.isArray(standingsJson?.data) ? standingsJson.data : [];
  // Typical NFL should be 32 teams; we just guard against "oops empty".
  assertNonEmptyArray("standings", standings);

  const updatedAt = new Date().toISOString();

  const outCombined = {
    team: {
      id: team.id,
      abbreviation: team.abbreviation,
      full_name: team.full_name,
      conference: team.conference,
      division: team.division,
    },
    season: SEASON,
    updatedAt,
    gamesRegular,
    gamesPostseason,
    playerSeasonStats: enriched,
  };

  const outDir = path.resolve(__dirname, "..", "src", "data", "nfl");
  const combinedPath = path.join(outDir, "seahawks.json");
  const playersPath = path.join(outDir, "players.json");
  const standingsPath = path.join(outDir, "standings.json");

  // Safety checks: don't overwrite with obviously broken payloads
  assertNonEmptyArray("gamesRegular", gamesRegular);
  assertNonEmptyArray("playerSeasonStats", enriched);

  safeWriteJson(combinedPath, outCombined);
  console.log(`wrote ${path.relative(process.cwd(), combinedPath)}`);

  safeWriteJson(playersPath, {
    season: SEASON,
    updatedAt,
    team: outCombined.team,
    playerSeasonStats: enriched,
  });
  console.log(`wrote ${path.relative(process.cwd(), playersPath)}`);

  safeWriteJson(standingsPath, {
    season: SEASON,
    updatedAt,
    data: standings,
  });
  console.log(`wrote ${path.relative(process.cwd(), standingsPath)}`);
}

main().catch((err) => {
  console.error(err?.stack || String(err));
  process.exit(1);
});
