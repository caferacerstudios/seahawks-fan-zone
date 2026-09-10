#!/usr/bin/env node
// Generate missing Seahawks recaps in the current (or staged Airflow) workspace.
// Existing complete prose is retained; publishing to the website is a separate import.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createNflApiClient } from "./nfl-api-client.mjs";
import { schedulePhase, scheduleState } from "../src/lib/schedule.mjs";
import { atomicWriteJson, isCompleteRecap, validateGeneratedRecap } from "../src/lib/recap-artifacts.mjs";

const MODEL = "gpt-4o-mini";
const readJson = (filename) => JSON.parse(fs.readFileSync(filename, "utf8"));
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const teamAbbr = (team, fallback = "") => String(team?.abbreviation || team?.abbr || fallback).toUpperCase();
const seaIsHome = (game) => teamAbbr(game?.home_team) === "SEA";
const oppAbbr = (game) => seaIsHome(game) ? teamAbbr(game?.visitor_team) : teamAbbr(game?.home_team);

function pickKeyPlays(plays, limit = 10) {
  const picked = plays.filter((play) => play?.scoring_play === true).slice(0, limit);
  for (const play of plays) {
    if (picked.length >= limit) break;
    if (!picked.includes(play)) picked.push(play);
  }
  return picked;
}

function selectedGames(schedule) {
  const games = new Map();
  // Empty phase arrays must not hide a populated legacy `games` array.
  const records = [
    ...(Array.isArray(schedule.games) ? schedule.games : []),
    ...(schedule.gamesRegular || []).map((game) => ({ phase: "regular", ...game })),
    ...(schedule.gamesPostseason || []).map((game) => ({ phase: "postseason", ...game })),
  ];
  for (const game of records) {
    if (!object(game)) throw new Error("Invalid game in recap schedule");
    const id = String(game.id ?? game.game_id ?? "");
    const phase = schedulePhase(game);
    if (!["regular", "postseason"].includes(phase)) continue;
    if (![game.home_team, game.visitor_team].some((team) => teamAbbr(team) === "SEA")) continue;
    if (!/^\d+$/.test(id)) throw new Error("Recap schedule game has no valid API game ID");
    if (game.season != null && game.season !== schedule.season) continue;
    games.set(id, game);
  }
  return games;
}

async function openaiStructuredRecap(input, { fetchImpl, apiKey }) {
  const schema = {
    type: "object", additionalProperties: false,
    properties: {
      segments: { type: "array", minItems: 1, items: {
        type: "object", additionalProperties: false,
        properties: {
          t: { type: "string", enum: ["text", "player"] },
          v: { type: "string" },
          id: { type: ["integer", "string", "null"] },
          name: { type: ["string", "null"] },
        }, required: ["t", "v", "id", "name"],
      } },
      bullets: { type: "array", minItems: 3, maxItems: 3, items: { type: "string" } },
    }, required: ["segments", "bullets"],
  };
  let response;
  try {
    response = await fetchImpl("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(90000),
      body: JSON.stringify({ model: MODEL, input, text: { format: { type: "json_schema", name: "game_recap", strict: true, schema } } }),
    });
  } catch { throw new Error("OpenAI recap request failed or timed out"); }
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw new Error(`OpenAI recap HTTP ${response.status}`);
  }
  let payload;
  try { payload = await response.json(); }
  catch { throw new Error("OpenAI recap response is not valid JSON"); }
  if (payload?.status !== "completed") throw new Error("OpenAI recap response was not completed");
  const content = (payload.output || []).flatMap((item) => item?.content || []);
  if (content.some((item) => item?.type === "refusal")) throw new Error("OpenAI declined to generate this recap");
  const text = payload.output_text || content.filter((item) => item?.type === "output_text").map((item) => item.text).join("");
  let result;
  try { result = JSON.parse(text); }
  catch { throw new Error("OpenAI recap output is not valid structured JSON"); }
  if (!object(result) || Object.keys(result).length !== 2 || !Object.hasOwn(result, "segments") || !Object.hasOwn(result, "bullets")) throw new Error("Invalid OpenAI recap object schema");
  validateGeneratedRecap(result);
  return result;
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

export async function generateGameRecaps({
  projectRoot = process.cwd(),
  env = process.env,
  fetchImpl = globalThis.fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = () => Date.now(),
} = {}) {
  const sourcePath = path.join(projectRoot, "src/data/nfl/seahawks.json");
  const outPath = path.join(projectRoot, "src/data/nfl/gameRecaps.json");
  const schedule = readJson(sourcePath);
  if (!object(schedule) || !Number.isInteger(schedule.season)) throw new Error("Invalid recap source schedule");
  const season = schedule.season;
  const existing = fs.existsSync(outPath) ? readJson(outPath) : { season, recaps: {} };
  if (!object(existing) || !object(existing.recaps)) throw new Error("Invalid existing recap map");
  const recaps = { ...existing.recaps };
  const games = selectedGames(schedule);
  const pending = [...games].filter(([id, game]) => scheduleState(game) === "completed" && !isCompleteRecap(recaps[id]));
  if (pending.length && !env.BALLDONTLIE_API_KEY) throw new Error("Missing BALLDONTLIE_API_KEY env var.");
  if (pending.length && !env.OPENAI_API_KEY) throw new Error("Missing OPENAI_API_KEY env var.");
  const api = createNflApiClient({
    apiKey: env.BALLDONTLIE_API_KEY,
    intervalMs: env.NFL_REQUEST_INTERVAL_MS === undefined ? 15000 : Number(env.NFL_REQUEST_INTERVAL_MS),
    fetchImpl, sleep, now,
  });
  let openaiRequestCount = 0;
  const generatedGameIds = [];
  for (const [id, game] of games) {
    const current = recaps[id];
    if (!current) continue;
    if (!object(current)) throw new Error(`Invalid existing recap: ${id}`);
    const firstPublished = current.publishedAt ?? current.createdAt ?? existing.updatedAt ?? null;
    recaps[id] = {
      ...current,
      gameId: current.gameId ?? id,
      season: current.season ?? season,
      week: current.week ?? game.week ?? null,
      phase: current.phase ?? (schedulePhase(game) === "postseason" ? "Postseason" : "Regular season"),
      category: current.category ?? "Recap",
      publishedAt: firstPublished,
      updatedAt: current.updatedAt ?? firstPublished,
      game: current.game ?? game,
    };
  }
  for (const [id, game] of pending) {
    console.log(`Generating recap for game ${id} (week ${game.week})...`);
    const stats = await api.pagedGet("/stats", { "game_ids[]": [Number(id)] });
    let plays;
    try { plays = await api.pagedGet("/plays", { game_id: Number(id) }); }
    catch (error) {
      if (!String(error.message).startsWith("NFL HTTP 401:")) throw error;
      console.warn(`BDL plays not available for game ${id} (401). Falling back to stats-only recap.`);
      plays = [];
    }
    openaiRequestCount++;
    const recap = await openaiStructuredRecap(buildPrompt({ game, stats, plays }), { fetchImpl, apiKey: env.OPENAI_API_KEY });
    const timestamp = new Date(now()).toISOString();
    recaps[id] = {
      ...recaps[id], gameId: id, season, week: game.week ?? null,
      phase: schedulePhase(game) === "postseason" ? "Postseason" : "Regular season", category: "Recap",
      publishedAt: recaps[id]?.publishedAt ?? timestamp, updatedAt: timestamp,
      createdAt: recaps[id]?.createdAt ?? timestamp, game, ...recap,
    };
    generatedGameIds.push(id);
  }
  const updatedAt = new Date(now()).toISOString();
  const report = {
    schema_version: 1, status: "success", season, updatedAt,
    generatedCount: generatedGameIds.length, generatedGameIds,
    requestCount: api.requestCount, openaiRequestCount, model: MODEL,
  };
  // Publish only after every requested recap has completed and validated.
  atomicWriteJson(outPath, { ...existing, season, updatedAt, recaps });
  if (env.RECAP_GENERATION_REPORT) atomicWriteJson(env.RECAP_GENERATION_REPORT, report);
  console.log(JSON.stringify(report));
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  generateGameRecaps().catch((error) => {
    console.error(`Recap generation failed: ${error.message}`);
    process.exitCode = 1;
  });
}
