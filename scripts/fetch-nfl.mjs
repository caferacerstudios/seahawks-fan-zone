import fs from "node:fs";
import path from "node:path";

const API_KEY = process.env.BALLDONTLIE_API_KEY;
if (!API_KEY) throw new Error("Missing BALLDONTLIE_API_KEY");

const BASE = "https://api.balldontlie.io/nfl/v1";
const OUT_DIR = path.resolve("src/data/nfl");
fs.mkdirSync(OUT_DIR, { recursive: true });

function seasonForNow(d = new Date()) {
  // Jan/Feb = still prior season year (playoffs)
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  return m <= 2 ? y - 1 : y;
}

async function apiGet(url) {
  const res = await fetch(url, { headers: { Authorization: API_KEY } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}\n${await res.text()}`);
  return res.json();
}

async function getAllPages(url) {
  let page = 1;
  const per = 100;
  let all = [];

  while (true) {
    const u = url.includes("?")
      ? `${url}&per_page=${per}&page=${page}`
      : `${url}?per_page=${per}&page=${page}`;

    const j = await apiGet(u);
    all = all.concat(j.data || []);

    const meta = j.meta;
    if (!meta || !meta.next_page) break;
    page = meta.next_page;
  }

  return all;
}

async function main() {
  const season = seasonForNow();

  const teams = await apiGet(`${BASE}/teams`);
  const sea = teams.data.find((t) => t.abbreviation === "SEA");
  if (!sea) throw new Error("Could not find Seahawks (SEA) in /teams");
  const teamId = sea.id;

  const games = await getAllPages(
    `${BASE}/games?seasons[]=${season}&team_ids[]=${teamId}`
  );

  const teamSeasonStats = await apiGet(
    `${BASE}/team_season_stats?season=${season}&team_ids[]=${teamId}`
  );

  const activePlayers = await getAllPages(
    `${BASE}/players/active?team_ids[]=${teamId}`
  );

  const playerSeasonStats = await getAllPages(
    `${BASE}/season_stats?season=${season}&team_id=${teamId}`
  );

  const payload = {
    updatedAt: new Date().toISOString(),
    season,
    team: sea,
    games,
    teamSeasonStats: teamSeasonStats.data?.[0] ?? null,
    activePlayers,
    playerSeasonStats,
  };

  fs.writeFileSync(
    path.join(OUT_DIR, "seahawks.json"),
    JSON.stringify(payload, null, 2)
  );

  console.log(`Wrote src/data/nfl/seahawks.json (season ${season})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
