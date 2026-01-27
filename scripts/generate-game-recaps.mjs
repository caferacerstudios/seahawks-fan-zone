#!/usr/bin/env node
/**
 * Build-time recap generator:
 * - reads src/data/nfl/seahawks.json
 * - fetches BDL per-game stats
 * - (optionally) fetches play-by-play IF your tier allows it (401-safe)
 * - calls OpenAI (Responses API) to produce structured recap segments
 * - writes src/data/nfl/gameRecaps.json
 *
 * ENV:
 * - BALLDONTLIE_API_KEY
 * - OPENAI_API_KEY
 *
 * Output:
 * - src/data/nfl/gameRecaps.json  { season, updatedAt, recaps: { [gameId]: {segments, bullets, ...} } }
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
  const s = String(apiKey || "");
  if (s.toLowerCase().startsWith("bearer ")) return s;
  return s;
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
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

    // small politeness delay
    await sleep(120);
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

/* =======================
   Domain helpers
   ======================= */

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

/* =======================
   OpenAI (Responses API)
   ======================= */

async function openaiStructuredRecap(input) {
  // Strict JSON schema: "required" must include every key in properties.
  // We *require* id/name, but allow nulls for non-player segments.
  const schema = {
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
            id: { type: ["integer", "string", "null"] },
            name: { type: ["string", "null"] },
          },
          required: ["t", "v", "id", "name"],
        },
      },
      bullets: { type: "array", items: { type: "string" } },
    },
    required: ["segments", "bullets"],
  };

  const res = await fetch(`${OPENAI_BASE}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      // Use a widely-available model that supports json_schema Structured Outputs well
      model: "gpt-4o-mini",
      input,
      text: {
        format: {
          type: "json_schema",
          name: "game_recap",
          strict: true,
          schema,
        },
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenAI HTTP ${res.status} ${res.statusText}\n${body}`);
  }

  const json = await res.json();

  // Responses API usually provides `output_text`; keep fallback for older shapes.
  const outText =
    json?.output_text ||
    json?.output?.[0]?.content?.find?.((c) => c?.type === "output_text")?.text;

  if (!outText) throw new Error("OpenAI response missing output_text");
  return JSON.parse(outText);
}

function buildPrompt({ game, stats, plays }) {
  const opp = oppAbbr(game);
  const seaHome = seaIsHome(game);

  const topPlays = pickKeyPlays(plays, 12).map((p) => ({
    clock: p?.clock_display ?? null,
    period: p?.period ?? null,
    text: p?.text || p?.short_text || null,
    scoring: !!p?.scoring_play,
  }));

  const statRows = Array.isArray(stats) ? stats : [];

  // Build candidate players ONLY from stats rows (so we don't invent names).
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

  // de-dupe
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
      content: hasPlays
        ? [
            "You write factual NFL game recaps using ONLY the provided stats and play-by-play snippets.",
            "Do not invent plays, players, injuries, or coaching decisions.",
            "If uncertain, be vague rather than guessing.",
            "Output MUST follow the provided JSON schema.",
          ].join(" ")
        : [
            "You write factual NFL game recaps using ONLY the provided stats.",
            "Do NOT invent specific plays (no 'late TD', no 'game-sealing pick', etc.) unless it appears in the provided key_plays list.",
            "If uncertain, be vague rather than guessing.",
            "Output MUST follow the provided JSON schema.",
          ].join(" "),
    },
    {
      role: "user",
      content: JSON.stringify(
        {
          game: {
            id: game?.id ?? null,
            week: game?.week ?? null,
            date: game?.date ?? null,
            status: game?.status ?? null,
            home: teamAbbr(game?.home_team),
            away: teamAbbr(game?.visitor_team),
            sea_is_home: seaHome,
            score_home: game?.home_team_score ?? null,
            score_away: game?.visitor_team_score ?? null,
            opponent: opp,
          },
          key_plays: hasPlays ? topPlays : [],
          stat_rows_sample: statRows.slice(0, 180),
          candidate_players: candidatesDedup.slice(0, 90),
          instructions: {
            style: "1 short paragraph + 3 bullet highlights",
            segments_rule:
              "Write the paragraph as an array of segments. Use {t:'text', v:'...', id:null, name:null} for normal text. " +
              "Whenever you mention a player from candidate_players, emit that name as {t:'player', v:'<display name>', id:<id>, name:'<same name>'}. " +
              "Only link players that appear in candidate_players; otherwise keep it as normal text.",
          },
        },
        null,
        2
      ),
    },
  ];
}

/* =======================
   Main
   ======================= */

async function main() {
  const seahawks = readJson(seahawksPath);
  const season = seahawks?.season ?? null;

  const rawGames =
    Array.isArray(seahawks?.gamesRegular) || Array.isArray(seahawks?.gamesPostseason)
      ? [...(seahawks.gamesRegular || []), ...(seahawks.gamesPostseason || [])]
      : Array.isArray(seahawks?.games)
        ? seahawks.games
        : [];

  const existing = fs.existsSync(outPath)
    ? readJson(outPath)
    : { season, updatedAt: null, recaps: {} };

  const recaps = existing?.recaps && typeof existing.recaps === "object" ? existing.recaps : {};
  let wrote = 0;

  for (let i = 0; i < rawGames.length; i++) {
    const g = rawGames[i];
    const id = gameKey(g, i);

    // Only generate for Final games
    if (!isFinal(g)) continue;

    // Skip if already exists
    if (recaps[id]?.segments?.length && recaps[id]?.bullets?.length) continue;

    console.log(`Generating recap for game ${id} (week ${g?.week})...`);

    // Stats (game_ids[] is supported)
    const statsResp = await bdlGet("/stats", { "game_ids[]": [Number(g?.id)] });
    const stats = Array.isArray(statsResp?.data) ? statsResp.data : [];

    // Plays (optional; 401-safe)
    const plays = await bdlTryPlays(g?.id);

    const prompt = buildPrompt({ game: g, stats, plays });
    const recap = await openaiStructuredRecap(prompt);

    recaps[id] = {
      gameId: id,
      createdAt: new Date().toISOString(),
      ...recap,
    };

    wrote++;

    // tiny delay so we don't slam OpenAI if you generate a bunch
    await sleep(250);
  }

  const out = {
    season,
    updatedAt: new Date().toISOString(),
    recaps,
  };

  writeJson(outPath, out);
  console.log(`wrote ${path.relative(process.cwd(), outPath)} (new recaps: ${wrote})`);
}

main().catch((err) => {
  console.error(err?.stack || String(err));
  process.exit(1);
});

