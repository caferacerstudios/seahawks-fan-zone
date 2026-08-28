const TEAM_NAMES = {
  ARI: "Arizona Cardinals", ATL: "Atlanta Falcons", BAL: "Baltimore Ravens", BUF: "Buffalo Bills",
  CAR: "Carolina Panthers", CHI: "Chicago Bears", CIN: "Cincinnati Bengals", CLE: "Cleveland Browns",
  DAL: "Dallas Cowboys", DEN: "Denver Broncos", DET: "Detroit Lions", GB: "Green Bay Packers",
  HOU: "Houston Texans", IND: "Indianapolis Colts", JAX: "Jacksonville Jaguars", KC: "Kansas City Chiefs",
  LAC: "Los Angeles Chargers", LAR: "Los Angeles Rams", LV: "Las Vegas Raiders", MIA: "Miami Dolphins",
  MIN: "Minnesota Vikings", NE: "New England Patriots", NO: "New Orleans Saints", NYG: "New York Giants",
  NYJ: "New York Jets", PHI: "Philadelphia Eagles", PIT: "Pittsburgh Steelers", SF: "San Francisco 49ers",
  TB: "Tampa Bay Buccaneers", TEN: "Tennessee Titans", WAS: "Washington Commanders",
};

const DIVISION = new Set(["ARI", "LAR", "SF"]);
const PACIFIC = "America/Los_Angeles";
const abbreviation = (team) => String(team?.abbreviation ?? team?.abbr ?? "").toUpperCase();

export function scheduleResult(game) {
  if (game?.state !== "completed") return null;
  if (game?.home_team_score == null || game?.visitor_team_score == null) return null;
  const home = Number(game?.home_team_score);
  const away = Number(game?.visitor_team_score);
  if (!Number.isFinite(home) || !Number.isFinite(away)) return null;
  const seahawks = game?.isHome ? home : away;
  const opponent = game?.isHome ? away : home;
  return { outcome: seahawks === opponent ? "T" : seahawks > opponent ? "W" : "L", seahawks, opponent };
}

function pacificDay(date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: PACIFIC, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function scheduleRow(game, { nextGameId = null, index = 0, now = new Date() } = {}) {
  if (game?.state === "bye") return {
    kind: "bye", state: "bye", week: game?.week ? `Week ${game.week}` : "Season break",
    status: "Bye", detail: "No game scheduled", id: String(game?.id ?? `bye-${index}`),
  };

  const opponentAbbr = abbreviation(game?.opponent);
  const opponentName = game?.opponent?.full_name ?? game?.opponent?.fullName ?? game?.opponent?.name
    ?? TEAM_NAMES[opponentAbbr] ?? (opponentAbbr || "Opponent TBD");
  const result = scheduleResult(game);
  const isNext = String(game?.id) === String(nextGameId);
  const explicitState = game?.state ?? "upcoming";
  const state = ["postponed", "in_progress", "tbd", "canceled", "completed"].includes(explicitState) ? explicitState : isNext ? "next" : explicitState;
  const stateLabel = result ? "Final" : ({
    canceled: "Canceled", postponed: "Postponed", in_progress: "In progress",
    completed: "Final", tbd: "Details TBD", next: "Up next", upcoming: "Upcoming",
  })[state] ?? "Upcoming";
  const startsAt = game?.startsAt ? new Date(game.startsAt) : null;
  const validStart = startsAt && Number.isFinite(startsAt.getTime());
  const gameDay = validStart && pacificDay(startsAt) === pacificDay(now);
  const action = game?.state === "completed" ? "Recap"
    : game?.state === "postponed" ? "Updated details"
    : game?.state === "in_progress" || gameDay ? "Game center"
    : game?.previewAvailable ? "Preview"
    : "Game details";
  const date = game?.dateConfirmed && game?.date
    ? new Intl.DateTimeFormat("en-US", { timeZone: PACIFIC, weekday: "short", month: "short", day: "numeric" }).format(validStart ? startsAt : new Date(`${game.date}T12:00:00Z`))
    : "Date TBD";
  const kickoff = game?.timeConfirmed && validStart
    ? `${new Intl.DateTimeFormat("en-US", { timeZone: PACIFIC, hour: "numeric", minute: "2-digit" }).format(startsAt)} PT`
    : "Time TBD";

  return {
    kind: "game", id: String(game?.id ?? game?.game_id ?? index), state, stateLabel, result,
    resultLabel: result ? `SEA ${result.seahawks}, ${opponentAbbr || "OPP"} ${result.opponent}` : null,
    week: game?.week ? `Week ${game.week}` : "Game", date, kickoff,
    homeAway: game?.isHome ? "vs" : "at", homeAwayLabel: game?.isHome ? "Home" : "Away",
    opponentAbbr, opponentName, network: game?.network || null, venue: game?.venue || null,
    division: DIVISION.has(opponentAbbr), primeTime: Boolean(game?.prime_time ?? game?.primeTime ?? game?.is_primetime),
    record: game?.seahawksRecordAfter || null,
    action, href: game?.canonicalUrl || `/games/${encodeURIComponent(String(game?.id ?? game?.game_id ?? index))}`,
    venueUrl: game?.venueUrl || null, watchUrl: game?.watchUrl || null,
  };
}

export function groupScheduleMonths(games) {
  const groups = [];
  let currentLabel = "Schedule";
  for (const game of games) {
    if (game?.state !== "bye") {
      const value = game?.startsAt ?? game?.date;
      const date = value ? new Date(value) : null;
      currentLabel = date && Number.isFinite(date.getTime())
        ? new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: PACIFIC }).format(date)
        : "Date to be announced";
    }
    const last = groups.at(-1);
    if (last?.label === currentLabel) last.games.push(game);
    else groups.push({ label: currentLabel, games: [game] });
  }
  return groups;
}
