#!/usr/bin/env node
/**
 * Build-time player profiles (Seahawks):
 * - reads src/data/nfl/seahawks.json (season stats)
 * - derives "roster" from seahawks.json playerSeasonStats (deduped)
 * - fetches BDL player_injuries (best-effort; endpoint/tier may vary)
 * - filters injuries down to ONLY the derived Seahawks playerIds
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
 * - (optional) FORCE=1 to regenerate even if profile exists
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

const FORCE = String(process.env.FORCE || "").toLowerCase() === "1";

const projectRoot = process.cwd();
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

function pickPos(p) {
  return String(p?.position_abbreviation || p?.position || "").toUpperCase();
}

// Deduplicate season stat rows by player id, keeping the “best” stat line (most total yards)
function reduceBestStatsByPlayer(statRows) {
  const bestById = new Map();

  for (const r of statRows || []) {
    const pid = r?.player?.id ?? r?.player_id ?? null;
    if (!pid) continue;

    const key = String(pid);
    const existing = bestById.get(key);
    if (!existing || totalYards(r) > totalYards(existing)) bestById.set(key, r);
  }

  return bestById;
}

function deriveRosterFromStats(statRows) {
  // Build a minimal roster list from the stats file (Seahawks-only data source).
  const byId = new Map();

  for (const r of statRows || []) {
    const p = r?.player || null;
    const pid = p?.id ?? r?.player_id ?? null;
    if (pid == null) continue;

    const key = String(pid);
    if (!byId.has(key)) {
      byId.set(key, {
        id: key,
        first_name: p?.first_name ?? null,
        last_name: p?.last_name ?? null,
        full_name: p?.full_name ?? null,
        position_abbreviation: p?.position_abbreviation ?? null,
        position: p?.position ?? null,
        jersey_number: p?.jersey_number ?? p?.jersey ?? null,
        height: p?.height ?? null,
        weight: p?.weight ?? null,
        college: p?.college ?? null,
        experience: p?.experience ?? p?.years_pro ?? null,
      });
    }
  }

  return Array.from(byId.values());
}

async function bdlTryInjuriesAll() {
  // Endpoint availability can vary by tier. Try common variants; fall back to [].
  const tries = [
    { endpoint: "/player_injuries", params: {} },
    { endpoint: "/injuries", params: {} },
  ];

  for (const t of tries) {
    try {
      const data = await bdlPaged(t.endpoint, t.params);
      return Array.isArray(data) ? data : [];
    } catch (e) {
      const status = e?.status;
      const msg = String(e?.message || "").toLowerCase();

      if (status === 401 || status === 403) {
        console.warn(`BDL injuries not available (HTTP ${status}). Writing empty injuries.json.`);
        return [];
      }
      if (status === 404 || msg.includes("not found")) {
        // try next
      } else {
        // try next
      }
    }
  }

  console.warn("BDL injuries endpoint not found/available. Writing empty injuries.json.");
  return [];
}

function normalizeInjuryRow(row) {
  // BDL fields vary; "comment" often contains the detail.
  const pid = row?.player?.id ?? row?.player_id ?? null;
  const player = row?.player ?? null;

  return {
    playerId: pid != null ? String(pid) : null,
    playerName: playerName(player),
    status: row?.status ?? row?.injury_status ?? row?.game_status ?? null,
    description: row?.comment ?? row?.description ?? row?.injury_description ?? row?.details ?? null,
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

  const outText =
    json?.output_text ||
    json?.output?.[0]?.content?.find?.((c) => c?.type === "output_text")?.text;

  if (!outText) throw new Error("OpenAI response missing output_text");
  return JSON.parse(outText);
}

function buildPrompt({ player, statRow, injury }) {
  const name = playerName(player);
  const pos = pickPos(player) || null;

  const s = statRow || null;

  const profileInput = {
    player: {
      id: player?.id ?? null,
      name,
      position: pos,
      jersey_number: player?.jersey_number ?? null,
      height: player?.height ?? null,
      weight: player?.weight ?? null,
      college: player?.college ?? null,
      experience: player?.experience ?? null,
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
      recap: "1 short paragraph + exactly 3 bullets. Use ONLY provided season_stat_line. If season_stat_line missing, keep recap generic without invented stats.",
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
  const seahawksData = readJson(seahawksPath);

  const season = seahawksData?.season ?? null;
  const statRows = Array.isArray(seahawksData?.playerSeasonStats) ? seahawksData.playerSeasonStats : [];

  const roster = deriveRosterFromStats(statRows);
  if (roster.length === 0) {
    console.warn("No players derived from seahawks.json playerSeasonStats. Writing empty profiles.");
  }

  const activeIdSet = new Set(roster.map((p) => String(p.id)));

  const bestStatsById = reduceBestStatsByPlayer(statRows);

  // Injuries (best effort): fetch whatever the endpoint returns, then filter to Seahawks ids
  const injuryRowsRaw = await bdlTryInjuriesAll();
  const injuriesNormAll = injuryRowsRaw.map(normalizeInjuryRow).filter((x) => x?.playerId);

  const injuriesNorm = injuriesNormAll.filter((x) => activeIdSet.has(String(x.playerId)));

  // If multiple rows exist per player, keep most recent reportDate if comparable
  const injuriesByPlayerId = new Map();
  for (const inj of injuriesNorm) {
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
    : { season, updatedAt: null, profiles: {} };

  const profiles = existing?.profiles && typeof existing.profiles === "object" ? existing.profiles : {};

  let wrote = 0;

  for (const p of roster) {
    const key = String(p.id);

    const existingBio = String(profiles?.[key]?.bio || "").trim();
    const existingRecap = String(profiles?.[key]?.recap?.paragraph || "").trim();

    if (!FORCE && existingBio.length > 0 && existingRecap.length > 0) continue;

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
      bio: String(out?.bio || ""),
      recap: {
        paragraph: String(out?.recap?.paragraph || ""),
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
    season,
    updatedAt: new Date().toISOString(),
    profiles,
  };

  const outInjuries = {
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
