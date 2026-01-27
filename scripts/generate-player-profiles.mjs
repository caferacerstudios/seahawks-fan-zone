#!/usr/bin/env node
/**
 * Build-time player profiles:
 * - reads src/data/nfl/players.json (treated as active roster)
 * - reads src/data/nfl/seahawks.json (season stats)
 * - tries to fetch BDL player injuries filtered by Seahawks team id (if endpoint/tier allows)
 * - calls OpenAI to generate:
 *    - short bio
 *    - short gameplay recap (1 paragraph + 3 bullets)
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
    err.body = body;
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
  return Number.isFinite(Number(env))
    ? Number(env)
    : Number.isFinite(Number(fromFile))
      ? Number(fromFile)
      : fallback;
}

function playerName(p) {
  if (!p) return "Unknown";
  const full = `${p.first_name || ""} ${p.last_name || ""}`.trim();
  return full || p.full_name || "Unknown";
}

function pickPos(p) {
  return String(p?.position_abbreviation || p?.position || "").toUpperCase();
}

function pickTeamId(p) {
  return p?.team?.id ?? p?.team_id ?? null;
}

function isActivePlayer(p) {
  // Keep this permissive: your players.json is already treated as "active roster".
  // If the API includes status flags, enforce them.
  const s = String(p?.status || p?.player_status || "").toLowerCase();
  if (!s) return true;
  // common shapes: "active", "inactive"
  if (s.includes("inactive")) return false;
  if (s.includes("active")) return true;
  return true;
}

function n(v) {
  return typeof v === "number" ? v : 0;
}
function totalYards(r) {
  return n(r.passing_yards) + n(r.rushing_yards) + n(r.receiving_yards);
}

// Deduplicate season stat rows by player id, keeping the “best” stat line (most total yards)
// and optionally restricting to the active roster.
function reduceBestStatsByPlayer(statRows, activeIdSet) {
  const bestById = new Map();

  for (const r of statRows || []) {
    const pid = r?.player?.id ?? r?.player_id ?? null;
    if (!pid) continue;

    const key = String(pid);
    if (activeIdSet?.size && !activeIdSet.has(key)) continue;

    const existing = bestById.get(key);
    if (!existing || totalYards(r) > totalYards(existing)) bestById.set(key, r);
  }

  return bestById;
}

async function bdlTryTeamInjuries(teamId) {
  // Endpoint availability can vary by tier. We try a couple common shapes and fall back to empty.
  const tries = [
    { endpoint: "/player_injuries", params: { team_id: Number(teamId) } },
    // sometimes list endpoints use team_ids[] style
    { endpoint: "/player_injuries", params: { "team_ids[]": [Number(teamId)] } },
  ];

  for (const t of tries) {
    try {
      const data = await bdlPaged(t.endpoint, t.params);
      return Array.isArray(data) ? data : [];
    } catch (e) {
      const msg = String(e?.message || "");
      const status = e?.status;

      // If unauthorized or not found, stop trying and fall back to empty.
      if (status === 401 || status === 403) {
        console.warn(`BDL injuries not available (HTTP ${status}). Writing empty injuries.json.`);
        return [];
      }
      if (status === 404 || msg.toLowerCase().includes("not found")) {
        console.warn(`BDL injuries endpoint not found. Writing empty injuries.json.`);
        return [];
      }

      // For other errors, try next variant; if last, throw.
      // (loop continues)
    }
  }

  return [];
}

function normalizeInjuryRow(row) {
  // Keep it generic; BDL field names can vary.
  const pid = row?.player?.id ?? row?.player_id ?? null;
  const player = row?.player ?? null;

  return {
    playerId: pid != null ? String(pid) : null,
    playerName: playerName(player),
    status: row?.status ?? row?.injury_status ?? row?.game_status ?? null,
    description: row?.description ?? row?.injury_description ?? row?.details ?? null,
    reportDate: row?.report_date ?? row?.date ?? row?.updated_at ?? null,
    raw: row,
  };
}

async function openaiPlayerProfile(prompt) {
  // Strict schema: `required` must include every key in properties.
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
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      input: prompt,
      text: {
        format: {
          type: "json_schema",
          name: "player_profile",
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

  // Responses API shape can include a convenience `output_text` or structured output in `output`.
  const outText =
    json?.output_text ||
    json?.output?.[0]?.content?.find?.((c) => c?.type === "output_text")?.text;

  if (!outText) throw new Error("OpenAI response missing output_text");
  return JSON.parse(outText);
}

function buildPrompt({ player, statRow, injury }) {
  const p = player || {};
  const name = playerName(p);
  const pos = pickPos(p) || null;
  const jersey = p?.jersey_number ?? p?.jersey ?? null;
  const height = p?.height ?? null;
  const weight = p?.weight ?? null;
  const college = p?.college ?? null;
  const experience = p?.experience ?? p?.years_pro ?? null;

  const s = statRow || null;

  // Keep the data small + factual. No “known for” claims unless supported here.
  const profileInput = {
    player: {
      id: p?.id ?? p?.player_id ?? null,
      name,
      position: pos,
      jersey_number: jersey,
      height,
      weight,
      college,
      experience,
    },
    injury: injury
      ? {
          status: injury?.status ?? null,
          description: injury?.description ?? null,
          report_date: injury?.reportDate ?? null,
        }
      : null,
    season_stat_line: s
      ? {
          games_played: s?.games_played ?? null,
          passing_yards: s?.passing_yards ?? null,
          passing_touchdowns: s?.passing_touchdowns ?? null,
          interceptions: s?.interceptions ?? null,
          rushing_yards: s?.rushing_yards ?? null,
          rushing_touchdowns: s?.rushing_touchdowns ?? null,
          receiving_yards: s?.receiving_yards ?? null,
          receiving_touchdowns: s?.receiving_touchdowns ?? null,
          targets: s?.targets ?? null,
          receptions: s?.receptions ?? null,
          fumbles: s?.fumbles ?? null,
          tackles: s?.tackles ?? null,
          sacks: s?.sacks ?? null,
          defensive_interceptions: s?.defensive_interceptions ?? null,
        }
      : null,
    rules: {
      bio: "2–4 sentences max. Use ONLY provided fields. If unknown, omit rather than guessing.",
      recap: "1 short paragraph + exactly 3 bullets. Use ONLY provided season_stat_line. If season_stat_line missing, keep recap generic (role + availability) without invented stats.",
      injuries: "If injury provided, mention status briefly. Do NOT invent injury details.",
      tone: "neutral, factual, not hypey.",
    },
  };

  return [
    {
      role: "system",
      content:
        "You generate factual NFL player blurbs for a Seahawks fan site using ONLY the JSON input. Do not invent awards, teams, career history, or specific plays. If a field is missing, omit it. Output must match the JSON schema exactly.",
    },
    { role: "user", content: JSON.stringify(profileInput, null, 2) },
  ];
}

async function main() {
  const playersData = readJson(playersPath);
  const seahawksData = readJson(seahawksPath);

  const seaTeamId = getSeaTeamId(seahawksData);
  const rosterAll = getRoster(playersData);

  // Filter: only active Seahawks roster
  const roster = rosterAll
    .filter((p) => Number(pickTeamId(p)) === Number(seaTeamId))
    .filter((p) => isActivePlayer(p));

  const activeIdSet = new Set(
    roster
      .map((p) => p?.id ?? p?.player_id ?? null)
      .filter((x) => x != null)
      .map((x) => String(x))
  );

  const statRows = Array.isArray(seahawksData?.playerSeasonStats) ? seahawksData.playerSeasonStats : [];
  const bestStatsById = reduceBestStatsByPlayer(statRows, activeIdSet);

  // Injuries (best effort)
  const injuryRows = await bdlTryTeamInjuries(seaTeamId);
  const injuriesNorm = injuryRows.map(normalizeInjuryRow).filter((x) => x?.playerId);

  const injuriesByPlayerId = new Map();
  for (const inj of injuriesNorm) {
    // If multiple rows exist, keep the most recent reportDate (lexicographic ISO works if it is ISO).
    const key = String(inj.playerId);
    const existing = injuriesByPlayerId.get(key);
    if (!existing) {
      injuriesByPlayerId.set(key, inj);
      continue;
    }
    const a = String(inj.reportDate || "");
    const b = String(existing.reportDate || "");
    if (a && (!b || a > b)) injuriesByPlayerId.set(key, inj);
  }

  // Load existing profiles to avoid re-spending tokens
  const existing = fs.existsSync(outProfilesPath)
    ? readJson(outProfilesPath)
    : { season: seahawksData?.season ?? null, updatedAt: null, profiles: {} };

  const profiles = existing?.profiles && typeof existing.profiles === "object" ? existing.profiles : {};

  let wrote = 0;
  for (const p of roster) {
    const pid = p?.id ?? p?.player_id ?? null;
    if (pid == null) continue;

    const key = String(pid);

    // Skip if already present and looks valid
    if (profiles?.[key]?.bio && profiles?.[key]?.recap?.paragraph) continue;

    const statRow = bestStatsById.get(key) || null;
    const injury = injuriesByPlayerId.get(key) || null;

    console.log(`Generating profile for ${playerName(p)} (${key})...`);

    const prompt = buildPrompt({ player: p, statRow, injury });
    const out = await openaiPlayerProfile(prompt);

    profiles[key] = {
      playerId: key,
      name: playerName(p),
      position: pickPos(p) || null,
      createdAt: new Date().toISOString(),
      bio: out?.bio ?? "",
      recap: {
        paragraph: out?.recap?.paragraph ?? "",
        bullets: Array.isArray(out?.recap?.bullets) ? out.recap.bullets : [],
      },
      injury: injury
        ? {
            status: injury?.status ?? null,
            description: injury?.description ?? null,
            reportDate: injury?.reportDate ?? null,
          }
        : null,
    };

    wrote++;
  }

  const outProfiles = {
    season: seahawksData?.season ?? null,
    updatedAt: new Date().toISOString(),
    teamId: seaTeamId,
    profiles,
  };

  const outInjuries = {
    teamId: seaTeamId,
    updatedAt: new Date().toISOString(),
    injuries: Array.from(injuriesByPlayerId.values()),
  };

  writeJson(outProfilesPath, outProfiles);
  writeJson(outInjuriesPath, outInjuries);

  console.log(`wrote ${path.relative(process.cwd(), outProfilesPath)} (new profiles: ${wrote})`);
  console.log(`wrote ${path.relative(process.cwd(), outInjuriesPath)} (injuries: ${outInjuries.injuries.length})`);
}

main().catch((err) => {
  console.error(err?.stack || String(err));
  process.exit(1);
});
