#!/usr/bin/env node
/**
 * Build-time recap generator (safe for BDL All-Star):
 * - reads src/data/nfl/seahawks.json
 * - fetches BDL per-game stats
 * - (optionally) fetches play-by-play IF your tier allows it
 * - calls OpenAI server-side to produce structured recap segments
 * - writes src/data/nfl/gameRecaps.json
 *
 * ENV:
 * - BALLDONTLIE_API_KEY
 * - OPENAI_API_KEY
 */

import fs from "node:fs";
import path from "node:path";

const BDL_BASE = "https://api.balldontlie.io/nfl/v1";
const OPENAI_BASE = "https://api.openai.com/v1";

const BDL_KEY = process.env.BALLDONTLIE_API_KEY;
if (!BDL_KEY) {
  console.error("Missing BALLDONTLIE_API_KEY env var.");
  process.exit(1);
}

const OPENAI_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_KEY) {
  console.error("Missing OPENAI_API_KEY env var.");
  process.exit(1);
}

const projectRoot = process.cwd();
const seahawksPath = path.join(projectRoot, "src", "data", "nfl", "seahawks.json");
const outPath = path.join(projectRoot, "src", "data", "nfl", "gameRecaps.json");

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}
function writeJson(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + "\n");
}
function authHeaderValue(apiKey) {
  if (String(apiKey).toLowerCase().startsWith("bearer ")) return apiKey;
  return apiKey;
}

async function bdlGet(endpoint, params = {}) {
  const url = new URL(BDL_BASE + endpoint);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) for (const item of v) url.searchParams.append(k, String(item));
    else url.searchParams.set(k, String(v));
  }

  const res = await fetch(url.toString(), {
    headers: { Authorization: authHeaderValue(BDL_KEY) },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err = new Error(`BDL HTTP ${res.status} ${res.statusText} for ${url}\n${body}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

async function bdlPaged(endpoint, baseParams = {}) {
  const all = [];
  let cursor = null;
  for (;;) {
    const params = { ...baseParams };
    if (cursor) params.cursor = cursor;

    const json = await bdlGet(endpoint, { ...params, per_page: 100 });
    const data = Array.isArray(json?.data) ? json.data : [];
    all.push(...data);

    const next = json?.meta?.next_cursor || null;
    if (!next) break;
    cursor = next;
  }
  return all;
}

async function bdlTryPlays(gameId) {
  try {
    return await bdlPaged("/plays", { game_id: Number(gameId) });
  } catch (e) {
    const msg = String(e?.message || "");
    if (e?.status === 401 || msg.includes("401 Unauthorized")) {
      console.warn(`BDL plays not available for game ${gameId} (401). Falling back to stats-only recap.`);
      return [];
    }
    throw e;
  }
}

function isFinal(game) {
  return String(game?.status || "").toLowerCase().includes("final");
}
function gameKey(g, idx) {
  return String(g?.id ?? g?.game_id ?? idx);
}
function teamAbbr(teamObj, fallback = "") {
  return String(teamObj?.abbreviation || fallback).toUpperCase();
}
function oppAbbr(game) {
  const home = teamAbbr(game?.home_team);
  const away = teamAbbr(game?.visitor_team);
  return home === "SEA" ? away : home;
}
function seaIsHome(game) {
  return teamAbbr(game?.home_team) === "SEA";
}

function pickKeyPlays(plays, limit = 10) {
  if (!Array.isArray(plays) || plays.length === 0) return [];
  const scoring = plays.filter((p) => p?.scoring_play === true);
  const picked = scoring.slice(0, limit);
  if (picked.length < limit) {
    for (const p of plays) {
      if (picked.length >= limit) break;
      if (!picked.some((x) => x?.id === p?.id)) picked.push(p);
    }
  }
  return picked;
}

async function openaiStructuredRecap(input) {
  const schema = {
    name: "GameRecap",
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        segments: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              t: { type: "string", enum: ["text", "player"] },
              v: { type: "string" },
              id: { type: ["integer", "string", "null"] }
            },
            required: ["t", "v"]
          }
        },
        bullets: { type: "array", items: { type: "string" } }
      },
      required: ["segments", "bullets"]
    },
    strict: true
  };

  const res = await fetch(`${OPENAI_BASE}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-5.2-mini",
      input,
      text: {
        format: { type: "json_schema", json_schema: schema }
      }
    })
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenAI HTTP ${res.status} ${res.statusText}\n${body}`);
  }

  const json = await res.json();
  const outText =
    json?.output?.[0]?.content?.find?.((c) => c?.type === "output_text")?.text;

  if (!outText) throw new Error("OpenAI response missing output_text");
  return JSON.parse(outText);
}

function buildPrompt({ game, stats, plays }) {
  const opp = oppAbbr(game);
  const seaHome = seaIsHome(game);
  const topPlays = pickKeyPlays(plays, 12).map((p) => ({
    clock: p?.clock_display,
    period: p?.period,
    text: p?.text || p?.short_text,
    scoring: !!p?.scoring_play
  }));

  const statRows = Array.isArray(stats) ? stats : [];

  const candidatePlayers = [];
  for (const row of statRows) {
    const pl = row?.player;
    const id = row?.player_id ?? pl?.id ?? null;
    const name =
      pl?.full_name ||
      [pl?.first_name, pl?.last_name].filter(Boolean).join(" ") ||
      row?.player_name ||
      null;
    if (id != null && name) candidatePlayers.push({ id, name });
  }

  const seen = new Set();
  const candidatesDedup = [];
  for (const p of candidatePlayers) {
    const k = `${p.id}:${p.name}`;
    if (seen.has(k)) continue;
    seen.add(k);
    candidatesDedup.push(p);
  }

  const hasPlays = topPlays.length > 0;

  return [
    {
      role: "system",
      content:
        hasPlays
          ? "You write factual NFL game recaps using ONLY the provided stats and play-by-play snippets. Do not invent plays or players. Output MUST follow the provided JSON schema."
          : "You write factual NFL game recaps using ONLY the provided stats. Do not invent specific plays. If uncertain, be vague rather than guessing. Output MUST follow the provided JSON schema."
    },
    {
      role: "user",
      content: JSON.stringify(
        {
          game: {
            id: game?.id,
            week: game?.week,
            date: game?.date,
            status: game?.status,
            home: teamAbbr(game?.home_team),
            away: teamAbbr(game?.visitor_team),
            sea_is_home: seaHome,
            score_home: game?.home_team_score,
            score_away: game?.visitor_team_score,
            opponent: opp
          },
          key_plays: hasPlays ? topPlays : [],
          stat_rows_sample: statRows.slice(0, 160),
          candidate_players: candidatesDedup.slice(0, 80),
          instructions: {
            style: "1 short paragraph + 3 bullet highlights",
            link_rule:
              "Whenever you mention a player from candidate_players, emit a {t:'player', v:'Name', id:<id>} segment for the name. Otherwise use {t:'text', v:'...'} segments."
          }
        },
        null,
        2
      )
    }
  ];
}

async function main() {
  const seahawks = readJson(seahawksPath);
  const season = seahawks?.season ?? process.env.NFL_SEASON;

  const rawGames = Array.isArray(seahawks?.gamesRegular) || Array.isArray(seahawks?.gamesPostseason)
    ? [...(seahawks.gamesRegular || []), ...(seahawks.gamesPostseason || [])]
    : Array.isArray(seahawks?.games)
      ? seahawks.games
      : [];

  const existing = fs.existsSync(outPath)
    ? readJson(outPath)
    : { season, updatedAt: null, recaps: {} };

  const recaps = existing?.recaps || {};
  let wrote = 0;

  for (let i = 0; i < rawGames.length; i++) {
    const g = rawGames[i];
    const id = gameKey(g, i);

    if (!isFinal(g)) continue;
    if (recaps[id]?.segments?.length) continue;

    console.log(`Generating recap for game ${id} (week ${g?.week})...`);

    const statsResp = await bdlGet("/stats", { "game_ids[]": [Number(g?.id)] });
    const stats = Array.isArray(statsResp?.data) ? statsResp.data : [];

    const plays = await bdlTryPlays(g?.id);

    const prompt = buildPrompt({ game: g, stats, plays });
    const recap = await openaiStructuredRecap(prompt);

    recaps[id] = {
      gameId: id,
      createdAt: new Date().toISOString(),
      ...recap
    };

    wrote++;
  }

  const out = {
    season,
    updatedAt: new Date().toISOString(),
    recaps
  };

  writeJson(outPath, out);
  console.log(`wrote ${path.relative(process.cwd(), outPath)} (new recaps: ${wrote})`);
}

main().catch((err) => {
  console.error(err?.stack || String(err));
  process.exit(1);
});
