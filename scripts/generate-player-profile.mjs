#!/usr/bin/env node
/**
 * Build-time player profiles:
 * - reads src/data/nfl/players.json (treated as active roster)
 * - reads src/data/nfl/seahawks.json (season stats)
 * - fetches BDL player_injuries filtered by Seahawks team id
 * - calls OpenAI to generate:
 *    - short bio
 *    - short gameplay recap (paragraph + 3 bullets)
 * - writes:
 *    - src/data/nfl/playerProfiles.json
 *    - src/data/nfl/injuries.json
 *
 * ENV:
 * - BALLDONTLIE_API_KEY
 * - OPENAI_API_KEY
 * - (optional) SEA_TEAM_ID (fallback 31)
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
const playersPath = path.join(projectRoot, "src", "data", "nfl", "players.json");
const seahawksPath = path.join(projectRoot, "src", "data", "nfl", "seahawks.json");

const outProfilesPath = path.join(projectRoot, "src", "data", "nfl", "playerProfiles.json");
const outInjuriesPath = path.join(projectRoot, "src", "data", "nfl", "injuries.json");

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

function n(v) {
  return typeof v === "number" ? v : 0;
}
function totalYards(r) {
  return n(r.passing_yards) + n(r.rushing_yards) + n(r.receiving_yards);
}

function playerName(p) {
  if (!p) return "Unknown";
  const full = `${p.first_name || ""} ${p.last_name || ""}`.trim();
  return full || p.full_name || "Unknown";
}

function getRoster(playersData) {
  if (Array.isArray(playersData?.data)) return playersData.data;
  if (Array.isArray(playersData?.players)) return playersData.players;
  if (Array.isArray(playersData)) return playersData;
  return [];
}

function getSeaTeamId(teamData) {
  const fromFile = teamData?.team?.id ?? teamData?.team_id ?? null;
  const env = process.env.SEA_TEAM_ID ? Number(process.env.SEA_TEAM_ID) : null;
  const fallback = 31; // your logs show SEA team id: 31
  return Number.isFinite(Number(env)) ? Number(env) : Number.isFinite(Number(fromFile)) ? Number(fromFile) : fallback;
}

function reduceBestStatsByPlayer(statRows, activeIdSet) {
  const bestById = new Map();
  for (const r of statRows) {
    const pid = r?.player?.id ?? r?.player_id ?? null;
    if (!pid) continue;
    const key = String(pid);
    if (activeIdSet.size > 0 && !activeIdSet.has(key)) continue;

    const existing = bestById.get(key);
    if (!existing || totalYards(r) > totalYards(existing)) bestById.set(key, r);
  }
  return bestById;
}

async function openaiPlayerProfile(input) {
  // Strict schema: required includes every key in properties.
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      bio: { type: "string" },
      recap: {
        type: "object",
        additionalProperties: false,
        properties: {
          paragraph: { type: "string" },
          bullets: { type: "array", items: { type: "string" } },
        },
        required: ["paragraph", "bullets"],
      },
    },
    required: ["bio", "recap"],
  };

  const res = await fetch(`${OPENAI_BASE}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_KEY}`,
      "Content-Type": "applicat
