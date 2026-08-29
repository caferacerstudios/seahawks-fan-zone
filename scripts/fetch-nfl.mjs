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
 * - env NFL_SEASON (default: current/upcoming NFL season)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeSchedule } from "../src/lib/schedule.mjs";
import { buildPhasedStandings } from "../src/lib/standings.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_BASE = "https://api.balldontlie.io/nfl/v1";

const TEAM_ABBR = (process.env.NFL_TEAM_ABBR || "SEA").toUpperCase();

function defaultSeason(now = new Date()) {
  const year = now.getUTCFullYear();

  // The Super Bowl is played on the second Sunday in February. Keep showing
  // the season that just ended for one month, then move to the upcoming season.
  const februaryFirst = new Date(Date.UTC(year, 1, 1));
  const firstSunday = 1 + ((7 - februaryFirst.getUTCDay()) % 7);
  const superBowlSunday = new Date(Date.UTC(year, 1, firstSunday + 7));
  const upcomingSeasonStart = new Date(superBowlSunday);
  upcomingSeasonStart.setUTCMonth(upcomingSeasonStart.getUTCMonth() + 1);

  return now >= upcomingSeasonStart ? year : year - 1;
}

const SEASON = Number(process.env.NFL_SEASON) || defaultSeason();

const API_KEY = process.env.BALLDONTLIE_API_KEY;

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

function assertNonEmptyArray(name, arr) {
  if (!Array.isArray(arr) || arr.length === 0) {
    throw new Error(`Refusing to write: ${name} is empty (fetch looks broken).`);
  }
}

// Recap copy is durable across season rollovers. Before replacing the schedule,
// attach the old game's sourced metadata to each existing recap so the archive
// can still render dates, opponents, and final scores without another request.
function preserveRecapGameSnapshots(existingSchedulePath, recapPath) {
  if (!fs.existsSync(existingSchedulePath) || !fs.existsSync(recapPath)) return;
  const existingSchedule = JSON.parse(fs.readFileSync(existingSchedulePath, "utf8"));
  const recapStore = JSON.parse(fs.readFileSync(recapPath, "utf8"));
  const games = Array.isArray(existingSchedule?.games)
    ? existingSchedule.games
    : [...(existingSchedule?.gamesPreseason || []), ...(existingSchedule?.gamesRegular || []), ...(existingSchedule?.gamesPostseason || [])];
  const gamesById = new Map(games.map((game, index) => [String(game?.id ?? game?.game_id ?? index), game]));
  let changed = false;
  for (const [id, recap] of Object.entries(recapStore?.recaps ?? {})) {
    if (recap?.game || !gamesById.has(id)) continue;
    recap.game = gamesById.get(id);
    recap.season ??= existingSchedule?.season ?? null;
    changed = true;
  }
  if (changed) safeWriteJson(recapPath, recapStore);
}

async function main() {
  if (!API_KEY) throw new Error("Missing BALLDONTLIE_API_KEY env var.");
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
  const fetchedLeagueGames = await pagedGet("/games", {
    "seasons[]": [SEASON],
  });
  const leagueGames = fetchedLeagueGames.filter((g) => Number(g.season) === Number(SEASON));
  const gamesFiltered = leagueGames.filter((g) => [g.home_team?.id, g.visitor_team?.id].includes(team.id));

  // Normalize once at the ingestion boundary. In particular, `postseason:
  // false` does not mean regular season: the API also uses it for preseason.
  const normalizedSchedule = normalizeSchedule({ season: SEASON, sourceSeason: SEASON, games: gamesFiltered }, SEASON);
  const { games, gamesPreseason, gamesRegular, gamesPostseason, nextGameId } = normalizedSchedule;

  // 3) Fetch team player list (names/positions)
  // This endpoint is a player directory, not an authoritative current roster.
  // Keep it only for enriching statistical records.
  const players = await pagedGet("/players", { "team_ids[]": [team.id] });
  const playersById = new Map(players.map((p) => [p.id, p]));
  const rosterStore = JSON.parse(fs.readFileSync(path.resolve(__dirname, "..", "src", "data", "team", "roster.json"), "utf8"));
  const currentRoster = (rosterStore.players || []).filter((player) => player.status === "Active");

  // 4) Fetch season stats for this team + season.
  // Before regular-season stats exist for an upcoming season,
  // temporarily fall back to the previous season's player stats.
  let playerStatsSeason = SEASON;

  let seasonStatsRegular = await pagedGet("/season_stats", {
    season: playerStatsSeason,
    team_id: team.id,
    postseason: false,
  });

  let seasonStatsPostseason = await pagedGet("/season_stats", {
    season: playerStatsSeason,
    team_id: team.id,
    postseason: true,
  });

  if (
    seasonStatsRegular.length === 0 &&
    seasonStatsPostseason.length === 0
  ) {
    playerStatsSeason = SEASON - 1;

    console.warn(
      `No player stats available for ${SEASON}; falling back to ${playerStatsSeason}.`
    );

    seasonStatsRegular = await pagedGet("/season_stats", {
      season: playerStatsSeason,
      team_id: team.id,
      postseason: false,
    });

    seasonStatsPostseason = await pagedGet("/season_stats", {
      season: playerStatsSeason,
      team_id: team.id,
      postseason: true,
    });
  }

  const seasonStatsAll = [
    ...seasonStatsRegular,
    ...seasonStatsPostseason,
  ];

  const enriched = seasonStatsAll.map((row) => {
    const playerId =
      row.player_id ?? row.player?.id ?? row.playerId ?? null;

    const player = playerId
      ? playersById.get(playerId)
      : (row.player || null);

    return {
      ...row,
      player: player || null,
      player_id: playerId || row.player_id || null,
      team_id: row.team_id ?? team.id,
      season: row.season ?? playerStatsSeason,
    };
  });
  const updatedAt = new Date().toISOString();
  const phasedStandings = buildPhasedStandings({ season: SEASON, updatedAt, games: leagueGames, teams });

  const currentSeasonPayload = {
    team: {
      id: team.id,
      abbreviation: team.abbreviation,
      full_name: team.full_name,
      conference: team.conference,
      division: team.division,
    },
    season: SEASON,
    playerStatsSeason,
    updatedAt,
    sourceSeason: SEASON,
    games,
    gamesPreseason,
    gamesRegular,
    gamesPostseason,
    nextGameId,
    currentRoster,
    playerSeasonStats: enriched,
  };

  const outDir = path.resolve(__dirname, "..", "src", "data", "nfl");
  const combinedPath = path.join(outDir, "seahawks.json");
  const playersPath = path.join(outDir, "players.json");
  const standingsPath = path.join(outDir, "standings.json");
  const recapsPath = path.join(outDir, "gameRecaps.json");
  const previousSnapshot = fs.existsSync(combinedPath) ? JSON.parse(fs.readFileSync(combinedPath, "utf8")) : null;
  const previousSeasons = (Array.isArray(previousSnapshot?.seasons) ? previousSnapshot.seasons : previousSnapshot ? [previousSnapshot] : [])
    .filter((record) => Number(record?.season) !== Number(SEASON))
    .map(({ seasons, ...record }) => record);
  const outCombined = { ...currentSeasonPayload, seasons: [...previousSeasons, currentSeasonPayload] };

  // Safety checks: don't overwrite with obviously broken payloads
  assertNonEmptyArray("gamesRegular", gamesRegular);
  assertNonEmptyArray("playerSeasonStats", enriched);

  preserveRecapGameSnapshots(combinedPath, recapsPath);
  safeWriteJson(combinedPath, outCombined);
  console.log(`wrote ${path.relative(process.cwd(), combinedPath)}`);

  safeWriteJson(playersPath, {
    season: SEASON,
    playerStatsSeason,
    updatedAt,
    team: outCombined.team,
    currentRoster,
    playerSeasonStats: enriched,
  });
  console.log(`wrote ${path.relative(process.cwd(), playersPath)}`);

  safeWriteJson(standingsPath, phasedStandings);
  console.log(`wrote ${path.relative(process.cwd(), standingsPath)}`);
}

main().catch((err) => {
  const existingPath = path.resolve(__dirname, "..", "src", "data", "nfl", "seahawks.json");
  // A refresh must never replace good data with an empty/partial response. If
  // a previously validated snapshot exists, keep building with that snapshot;
  // the page will show its age through the freshness indicator.
  try {
    const existing = JSON.parse(fs.readFileSync(existingPath, "utf8"));
    normalizeSchedule(existing, existing.season);
    console.warn(`Schedule refresh failed; retaining last known valid schedule.\n${err?.message || err}`);
  } catch {
    console.error(err?.stack || String(err));
    process.exitCode = 1;
  }
});
