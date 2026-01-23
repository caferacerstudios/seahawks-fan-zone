#!/usr/bin/env node
/**
 * Fetch Seahawks NFL data from BALLDONTLIE and write to:
 *   src/data/nfl/seahawks.json
 *   src/data/nfl/players.json
 *
 * Safe behavior:
 * - If fetch fails, it will NOT overwrite existing good files.
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
  // Cursor pagination: { data: [...], meta: { next_cursor } }
  let out = [];
  let cursor = null;

  while (true) {
    const url = makeUrl(cursor);
    const json = await apiGet(url);
    out = out.concat(json?.data ?? []);
    const next = json?.meta?.next_cursor;

    if (next === null || next === undefined) break;
    cursor = next;
  }

  return out;
}

function safeWriteJsonAtomic(relPath, obj) {
  const full = path.resolve(process.cwd(), relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  const tmp = `${full}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, full);
  console.log(`wrote ${relPath}`);
}

function safeWriteOnlyOnSuccess(relPath, obj, ok) {
  const full = path.resolve(process.cwd(), relPath);

  if (!ok) {
    if (fs.existsSync(full)) {
      console.error(`keeping existing ${relPath} (fetch failed)`);
      return;
    }
    safeWriteJsonAtomic(relPath, { updatedAt: nowIso(), error: "fetch_failed_no_cache", ...obj });
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
  // games uses seasons[] (not season)
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
  // roster / players for SEA
  return fetchAllPages((cursor) => {
    const params = new URLSearchParams();
    params.set("per_page", "100");
    params.append("team_ids[]", String(seaTeamId));
    if (cursor !== null) params.set("cursor", String(cursor));
    return `${BASE}/players?${params.toString()}`;
  });
}

async function fetchSeasonStats(seaTeamId, seasonYear) {
  // season_stats expects season=<year>
  return fetchAllPages((cursor) => {
    const params = new URLSearchParams();
    params.set("per_page", "100");
    params.append("team_ids[]", String(seaTeamId));
    params.set("season", String(seasonYear));
    if (cursor !== null) params.set("cursor", String(cursor));
    return `${BASE}/season_stats?${params.toString()}`;
  });
}

function getGameSeasonType(game) {
  const wk = game?.week;

  // If API provides a flag, honor it
  if (typeof game?.postseason === "boolean") return game.postseason ? "playoffs" : "regular";
  if (typeof game?.is_postseason === "boolean") return game.is_postseason ? "playoffs" : "regular";

  // If week string includes "Playoff"
  if (typeof wk === "string" && /playoff/i.test(wk)) return "playoffs";

  // If week is numeric 1-18 => regular
  const n = Number(wk);
  if (Number.isFinite(n) && n >= 1 && n <= 18) return "regular";

  // Heuristic by date (Jan/Feb are postseason window)
  const dt = new Date(game?.date || 0);
  const month = dt.getUTCMonth() + 1;
  if (month === 1 || month === 2) return "playoffs";

  return "regular";
}

function normalizeSchedule(games, seaTeamId, seasonYear) {
  const filtered = (games ?? []).filter((g) => {
    if (g?.season && Number(g.season) !== Number(seasonYear)) return false;

    const home = String(g?.home_team?.abbreviation || "").toUpperCase();
    const away = String(g?.visitor_team?.abbreviation || "").toUpperCase();
    return home === "SEA" || away === "SEA";
  });

  const enriched = filtered.map((g) => ({
    ...g,
    seasonType: getGameSeasonType(g),
  }));

  // Regular season first (by week), then playoffs (by date)
  enriched.sort((a, b) => {
    const ta = a.seasonType === "playoffs" ? 1 : 0;
    const tb = b.seasonType === "playoffs" ? 1 : 0;
    if (ta !== tb) return ta - tb;

    if (ta === 0) {
      const wa = Number(a?.week ?? 0);
      const wb = Number(b?.week ?? 0);
      if (wa !== wb) return wa - wb;
    }

    const da = new Date(a?.date ?? 0).getTime();
    const db = new Date(b?.date ?? 0).getTime();
    return da - db;
  });

  return {
    updatedAt: nowIso(),
    season: seasonYear,
    teamId: seaTeamId,
    games: enriched,
  };
}

function pickPlayerIdFromStatRow(r) {
  // Different shapes exist; handle common ones.
  if (Number.isFinite(Number(r?.player_id))) return Number(r.player_id);
  if (Number.isFinite(Number(r?.player?.id))) return Number(r.player.id);
  if (Number.isFinite(Number(r?.athlete_id))) return Number(r.athlete_id);
  return null;
}

function makePlayerIndex(playersList) {
  const idx = new Map();
  for (const p of playersList ?? []) {
    const id = Number(p?.id);
    if (!Number.isFinite(id)) continue;

    const fullName =
      p?.full_name ||
      [p?.first_name, p?.last_name].filter(Boolean).join(" ").trim() ||
      "Unknown";

    const position = p?.position || "-";

    idx.set(id, {
      id,
      full_name: fullName,
      first_name: p?.first_name || null,
      last_name: p?.last_name || null,
      position,
    });
  }
  return idx;
}

function normalizePlayers(seasonStatsRows, playersList, seaTeamId, seasonYear) {
  const idx = makePlayerIndex(playersList);

  const rows = (seasonStatsRows ?? []).map((r) => {
    const pid = pickPlayerIdFromStatRow(r);
    const p = pid ? idx.get(pid) : null;

    return {
      ...r,
      player_id: pid ?? r?.player_id ?? null,
      player: {
        id: pid ?? null,
        full_name: p?.full_name || "Unknown",
        first_name: p?.first_name || null,
        last_name: p?.last_name || null,
        position: p?.position || "-",
        team_abbreviation: "SEA",
      },
    };
  });

  // De-dupe by player_id: keep row with highest games_played (if present)
  const dedup = new Map();
  for (const r of rows) {
    const pid = Number(r?.player_id);
    if (!Number.isFinite(pid) || pid <= 0) continue;

    const prev = dedup.get(pid);
    if (!prev) {
      dedup.set(pid, r);
      continue;
    }

    const gpPrev = Number(prev?.games_played ?? prev?.gp ?? 0);
    const gpCur = Number(r?.games_played ?? r?.gp ?? 0);
    if (gpCur >= gpPrev) dedup.set(pid, r);
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
    // If schedule looks too small, treat as failure so we don't overwrite good cache.
    if ((schedulePayload.games || []).length < 10) {
      throw new Error(`Schedule payload unexpectedly small (${schedulePayload.games.length}).`);
    }
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

    // Sanity: if nearly everyone is Unknown, join failed. Fail safe and keep cache.
    const total = playersPayload.players.length;
    const unknown = playersPayload.players.filter((p) => p?.player?.full_name === "Unknown").length;
    if (total < 10) throw new Error(`Players payload unexpectedly small (${total}).`);
    if (unknown / total > 0.25) {
      throw new Error(`Too many Unknown players after join (${unknown}/${total}).`);
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
