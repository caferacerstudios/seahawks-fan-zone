#!/usr/bin/env node
/**
 * Fetch Seahawks NFL data from BALLDONTLIE and write to:
 *   src/data/nfl/seahawks.json
 *   src/data/nfl/players.json
 *
 * Safe behavior:
 * - If network/API fails, DOES NOT overwrite existing good files.
 *
 * Requires:
 *   BALLDONTLIE_API_KEY in environment
 */

import fs from "node:fs";
import path from "node:path";

const API_KEY = process.env.BALLDONTLIE_API_KEY;
if (!API_KEY) {
  console.error("Missing BALLDONTLIE_API_KEY env var.");
  process.exit(1);
}

const BASE = "https://api.balldontlie.io/nfl/v1";

function nowIso() {
  return new Date().toISOString();
}

function guessSeasonYearUTC() {
  // NFL season year = current year, except Jan/Feb are still previous season.
  const d = new Date();
  const m = d.getUTCMonth() + 1;
  const y = d.getUTCFullYear();
  return m <= 2 ? y - 1 : y;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isRetryableNetworkError(err) {
  const c = err?.cause;
  const code = c?.code || err?.code;
  return (
    code === "EAI_AGAIN" ||
    code === "ENOTFOUND" ||
    code === "ECONNRESET" ||
    code === "ETIMEDOUT" ||
    code === "ECONNREFUSED" ||
    code === "UND_ERR_CONNECT_TIMEOUT"
  );
}

async function apiGet(url, { retries = 4 } = {}) {
  let attempt = 0;
  while (true) {
    try {
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
    } catch (err) {
      attempt += 1;
      if (attempt <= retries && isRetryableNetworkError(err)) {
        const backoff = 400 * Math.pow(2, attempt - 1);
        console.error(`Network/DNS error (attempt ${attempt}/${retries})`);
        console.error(`URL: ${url}`);
        console.error(`Reason: ${err?.cause?.code || err?.code || err?.message}`);
        console.error(`Retrying in ${backoff}ms...`);
        await sleep(backoff);
        continue;
      }
      throw err;
    }
  }
}

async function fetchAllPages(makeUrl) {
  // Cursor pagination. Response: { data: [...], meta: { next_cursor, per_page } }
  let out = [];
  let cursor = null;

  while (true) {
    const url = makeUrl(cursor);
    const json = await apiGet(url);
    const data = json?.data ?? [];
    out = out.concat(data);

    const next = json?.meta?.next_cursor ?? null;
    if (next === null || next === undefined) break;

    cursor = next;
  }

  return out;
}

function safeWriteJsonAtomic(relPath, obj) {
  const full = path.resolve(process.cwd(), relPath);
  const dir = path.dirname(full);
  fs.mkdirSync(dir, { recursive: true });

  const tmp = `${full}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, full);
  console.log(`wrote ${relPath}`);
}

function safeWriteOnlyOnSuccess(relPath, obj, ok) {
  // If ok === false, do not overwrite an existing file.
  const full = path.resolve(process.cwd(), relPath);

  if (!ok) {
    if (fs.existsSync(full)) {
      console.error(`keeping existing ${relPath} (fetch failed)`);
      return;
    }
    // If no existing file, write a stub so Astro imports won't crash.
    safeWriteJsonAtomic(relPath, {
      updatedAt: nowIso(),
      error: "fetch_failed_no_cache",
      ...obj,
    });
    return;
  }

  safeWriteJsonAtomic(relPath, obj);
}

async function getSeaTeamId() {
  const teams = await fetchAllPages((cursor) => {
    const params = new URLSearchParams();
    params.set("per_page", "100");
    if (cursor !== null) params.set("cursor", String(cursor));
    return `${BASE}/teams?${params.toString()}`;
  });

  const sea = teams.find((t) => String(t.abbreviation).toUpperCase() === "SEA");
  if (!sea?.id) throw new Error("Could not find SEA team id from /teams");
  return sea.id;
}

async function fetchSchedule(seaTeamId, seasonYear) {
  // IMPORTANT: games endpoint uses seasons[] (not season)
  // https://www.balldontlie.io/blog/nfl-scoreboard-react-tutorial/ shows seasons[] usage.
  return fetchAllPages((cursor) => {
    const params = new URLSearchParams();
    params.set("per_page", "100");
    params.append("team_ids[]", String(seaTeamId));
    params.append("seasons[]", String(seasonYear));
    if (cursor !== null) params.set("cursor", String(cursor));
    return `${BASE}/games?${params.toString()}`;
  });
}

async function fetchTeamPlayers(seaTeamId) {
  // Pull player identity data (name/pos) so season stats can show real names.
  return fetchAllPages((cursor) => {
    const params = new URLSearchParams();
    params.set("per_page", "100");
    params.append("team_ids[]", String(seaTeamId));
    if (cursor !== null) params.set("cursor", String(cursor));
    return `${BASE}/players?${params.toString()}`;
  });
}

async function fetchSeasonStats(seaTeamId, seasonYear) {
  // season_stats endpoint expects season=<year> (your earlier error showed param name is "season")
  return fetchAllPages((cursor) => {
    const params = new URLSearchParams();
    params.set("per_page", "100");
    params.append("team_ids[]", String(seaTeamId));
    params.set("season", String(seasonYear));
    if (cursor !== null) params.set("cursor", String(cursor));
    return `${BASE}/season_stats?${params.toString()}`;
  });
}

function normalizeSchedule(games, seaTeamId, seasonYear) {
  // Hard filter again, just in case.
  const filtered = (games ?? []).filter((g) => {
    // Some APIs include "season" on game objects; if missing, still keep.
    if (g?.season && Number(g.season) !== Number(seasonYear)) return false;

    const home = g?.home_team?.abbreviation;
    const away = g?.visitor_team?.abbreviation;
    const seaInGame =
      String(home || "").toUpperCase() === "SEA" || String(away || "").toUpperCase() === "SEA";

    return seaInGame;
  });

  // Sort by week then date
  filtered.sort((a, b) => {
    const wa = Number(a?.week ?? 0);
    const wb = Number(b?.week ?? 0);
    if (wa !== wb) return wa - wb;
    const da = new Date(a?.date ?? 0).getTime();
    const db = new Date(b?.date ?? 0).getTime();
    return da - db;
  });

  return {
    updatedAt: nowIso(),
    season: seasonYear,
    teamId: seaTeamId,
    games: filtered,
  };
}

function normalizePlayers(seasonStatsRows, playersList, seaTeamId, seasonYear) {
  const byId = new Map();
  for (const p of playersList ?? []) {
    if (!p?.id) continue;
    byId.set(Number(p.id), p);
  }

  const rows = (seasonStatsRows ?? []).map((r) => {
    const pid = Number(r?.player_id ?? r?.player?.id ?? 0);
    const p = byId.get(pid);

    const fullName =
      p?.full_name ||
      [p?.first_name, p?.last_name].filter(Boolean).join(" ").trim() ||
      r?.player?.full_name ||
      "Unknown";

    const pos = p?.position || r?.player?.position || "-";

    return {
      ...r,
      player_id: pid || r?.player_id,
      player: {
        id: pid || r?.player?.id || r?.player_id,
        full_name: fullName,
        first_name: p?.first_name || r?.player?.first_name || null,
        last_name: p?.last_name || r?.player?.last_name || null,
        position: pos,
        team_abbreviation: "SEA",
      },
    };
  });

  // De-dupe by player_id: keep the row with highest games_played if present
  const dedup = new Map();
  for (const r of rows) {
    const pid = Number(r?.player_id ?? 0);
    if (!pid) continue;
    const prev = dedup.get(pid);
    if (!prev) {
      dedup.set(pid, r);
      continue;
    }
    const gpA = Number(prev?.games_played ?? prev?.gp ?? 0);
    const gpB = Number(r?.games_played ?? r?.gp ?? 0);
    if (gpB >= gpA) dedup.set(pid, r);
  }

  const finalRows = Array.from(dedup.values());

  // Sort by position then name
  finalRows.sort((a, b) => {
    const pa = String(a?.player?.position || "");
    const pb = String(b?.player?.position || "");
    if (pa !== pb) return pa.localeCompare(pb);
    const na = String(a?.player?.full_name || "");
    const nb = String(b?.player?.full_name || "");
    return na.localeCompare(nb);
  });

  return {
    updatedAt: nowIso(),
    season: seasonYear,
    teamId: seaTeamId,
    players: finalRows,
  };
}

async function main() {
  const seasonYear = guessSeasonYearUTC();
  const seaTeamId = await getSeaTeamId();

  console.log(`Using SEA team id: ${seaTeamId}`);
  console.log(`Using season year: ${seasonYear}`);

  // Schedule
  let scheduleOk = false;
  let schedulePayload = null;
  try {
    const games = await fetchSchedule(seaTeamId, seasonYear);
    schedulePayload = normalizeSchedule(games, seaTeamId, seasonYear);
    scheduleOk = true;
  } catch (e) {
    console.error("Schedule fetch failed:");
    console.error(e?.message || e);
    schedulePayload = {
      updatedAt: nowIso(),
      season: seasonYear,
      teamId: seaTeamId,
      games: [],
      error: "schedule_fetch_failed",
    };
  }
  safeWriteOnlyOnSuccess("src/data/nfl/seahawks.json", schedulePayload, scheduleOk);

  // Players
  let playersOk = false;
  let playersPayload = null;
  try {
    const [playersList, seasonStats] = await Promise.all([
      fetchTeamPlayers(seaTeamId),
      fetchSeasonStats(seaTeamId, seasonYear),
    ]);

    playersPayload = normalizePlayers(seasonStats, playersList, seaTeamId, seasonYear);

    // If we somehow got an empty set, treat as failure so we don't overwrite good cache.
    if ((playersPayload.players || []).length < 10) {
      throw new Error(`Player payload unexpectedly small (${playersPayload.players.length}).`);
    }

    playersOk = true;
  } catch (e) {
    console.error("Players fetch failed:");
    console.error(e?.message || e);
    playersPayload = {
      updatedAt: nowIso(),
      season: seasonYear,
      teamId: seaTeamId,
      players: [],
      error: "players_fetch_failed",
    };
  }
  safeWriteOnlyOnSuccess("src/data/nfl/players.json", playersPayload, playersOk);

  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
