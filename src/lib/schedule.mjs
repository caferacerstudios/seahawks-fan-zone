const TEAM = "SEA";
const PACIFIC = "America/Los_Angeles";

export const SCHEDULE_PHASES = ["preseason", "regular", "postseason"];
export const SCHEDULE_STATES = ["bye", "canceled", "postponed", "completed", "in_progress", "upcoming", "tbd"];

const text = (value) => String(value ?? "").trim();
const abbr = (team) => text(team?.abbreviation ?? team?.abbr).toUpperCase();
const integer = (value) => Number.isInteger(Number(value)) ? Number(value) : null;

export function schedulePhase(game) {
  const value = text(game?.phase ?? game?.season_type ?? game?.seasonType ?? game?.type).toLowerCase();
  if (value.includes("pre")) return "preseason";
  if (value.includes("post") || value.includes("playoff") || game?.postseason === true || game?.is_postseason === true) return "postseason";
  return "regular";
}

export function scheduleState(game) {
  if (game?.bye === true || text(game?.kind).toLowerCase() === "bye" || /\bbye\b/i.test(text(game?.status))) return "bye";
  const value = text(game?.state ?? game?.status).toLowerCase().replaceAll("-", "_").replaceAll(" ", "_");
  if (value.includes("cancel")) return "canceled";
  if (value.includes("postpon")) return "postponed";
  if (/final|finished|complete|closed/.test(value)) return "completed";
  if (/in_progress|live|halftime|quarter|overtime/.test(value)) return "in_progress";
  if (/tbd|to_be_determined|unconfirmed/.test(value)) return "tbd";
  return "upcoming";
}

function sourceDate(game) {
  return game?.startsAt ?? game?.date ?? game?.start_time ?? game?.kickoff ?? null;
}

function dateParts(game) {
  const raw = sourceDate(game);
  if (!raw) return { startsAt: null, date: null, dateConfirmed: false, timeConfirmed: false };
  const parsed = new Date(raw);
  if (!Number.isFinite(parsed.getTime())) return { startsAt: null, date: null, dateConfirmed: false, timeConfirmed: false };
  const explicitDateTbd = game?.date_tbd === true || game?.dateTbd === true || game?.date_confirmed === false || game?.dateConfirmed === false;
  const explicitTimeTbd = game?.time_tbd === true || game?.timeTbd === true || game?.time_confirmed === false || game?.timeConfirmed === false;
  const placeholderMidnight = parsed.getUTCHours() === 0 && parsed.getUTCMinutes() === 0 && parsed.getUTCSeconds() === 0;
  const dateConfirmed = !explicitDateTbd;
  const timeConfirmed = dateConfirmed && !explicitTimeTbd && (game?.timeConfirmed === true || !placeholderMidnight);
  return {
    startsAt: timeConfirmed ? parsed.toISOString() : null,
    date: dateConfirmed ? parsed.toISOString().slice(0, 10) : null,
    dateConfirmed,
    timeConfirmed,
  };
}

export function normalizeGame(game, season) {
  const phase = schedulePhase(game);
  const state = scheduleState(game);
  const dates = state === "bye" ? { startsAt: null, date: null, dateConfirmed: false, timeConfirmed: false } : dateParts(game);
  const home = game?.home_team ?? game?.homeTeam ?? null;
  const away = game?.visitor_team ?? game?.away_team ?? game?.awayTeam ?? null;
  const suppliedOpponent = game?.opponent ?? null;
  const opponent = suppliedOpponent ?? (abbr(home) === TEAM ? away : abbr(away) === TEAM ? home : null);
  const venueValue = game?.venue?.name ?? game?.venue ?? game?.stadium?.name ?? game?.stadium ?? null;
  const networkValue = game?.network ?? game?.tv_network ?? game?.tvNetwork ?? game?.broadcast ?? null;
  const id = text(game?.id ?? game?.game_id) || `${season}-${phase}-${integer(game?.week) ?? "tbd"}-${state}`;
  return {
    ...game,
    id,
    season: integer(game?.season ?? season),
    phase,
    state,
    week: integer(game?.week),
    bye: state === "bye",
    homeTeam: home,
    awayTeam: away,
    opponent,
    isHome: state === "bye" ? null : abbr(home) === TEAM ? true : abbr(away) === TEAM ? false : null,
    ...dates,
    venue: game?.venue_confirmed === false || game?.venueConfirmed === false ? null : venueValue || null,
    network: game?.network_confirmed === false || game?.networkConfirmed === false ? null : networkValue || null,
    opponentConfirmed: state === "bye" ? false : Boolean(opponent) && game?.opponent_confirmed !== false && game?.opponentConfirmed !== false,
  };
}

function addBye(games, season) {
  const regular = games.filter((game) => game.phase === "regular" && game.state !== "canceled");
  if (regular.some((game) => game.state === "bye")) return games;
  const weeks = new Set(regular.map((game) => game.week).filter((week) => week >= 1 && week <= 18));
  if (regular.length !== 17 || weeks.size !== 17) return games;
  const missing = Array.from({ length: 18 }, (_, index) => index + 1).filter((week) => !weeks.has(week));
  if (missing.length !== 1) return games;
  return [...games, normalizeGame({ id: `${season}-regular-${missing[0]}-bye`, season, season_type: "regular", week: missing[0], status: "bye", bye: true }, season)];
}

function eventTime(game) {
  if (game.startsAt) return new Date(game.startsAt).getTime();
  if (game.date) return new Date(`${game.date}T23:59:59-07:00`).getTime();
  return Number.MAX_SAFE_INTEGER;
}

export function sortSchedule(games) {
  const phaseOrder = new Map(SCHEDULE_PHASES.map((phase, index) => [phase, index]));
  return [...games].sort((a, b) =>
    (phaseOrder.get(a.phase) ?? 9) - (phaseOrder.get(b.phase) ?? 9)
    || (a.week ?? 99) - (b.week ?? 99)
    || eventTime(a) - eventTime(b));
}

export function normalizeSchedule(raw, expectedSeason = raw?.season) {
  const season = integer(expectedSeason);
  if (!season) throw new Error("Schedule season is missing or invalid.");
  const source = Array.isArray(raw?.games)
    ? raw.games
    : [...(raw?.gamesPreseason ?? []), ...(raw?.gamesRegular ?? []), ...(raw?.gamesPostseason ?? [])];
  const games = sortSchedule(addBye(source.map((game) => normalizeGame(game, season)), season));
  const normalized = {
    ...raw,
    season,
    sourceSeason: integer(raw?.sourceSeason ?? raw?.season),
    games,
    gamesPreseason: games.filter((game) => game.phase === "preseason"),
    gamesRegular: games.filter((game) => game.phase === "regular"),
    gamesPostseason: games.filter((game) => game.phase === "postseason"),
    nextGameId: nextScheduleEvent(games)?.id ?? null,
  };
  validateSchedule(normalized, season);
  return normalized;
}

export function nextScheduleEvent(games, now = new Date()) {
  // Status is authoritative: an unfinished event remains next even if its
  // scheduled instant has passed (stale feeds and postponements are common).
  // Sorting by phase/week also keeps a same-day preseason game ahead of Week 1.
  void now;
  const eligible = sortSchedule(games).filter((game) => !["bye", "canceled", "completed"].includes(game.state));
  return eligible[0] ?? null;
}

export function validateSchedule(schedule, displaySeason = schedule?.season) {
  const errors = [];
  const games = Array.isArray(schedule?.games) ? schedule.games : [];
  const sourceSeason = integer(schedule?.sourceSeason ?? schedule?.season);
  if (integer(displaySeason) !== sourceSeason) errors.push(`season mismatch: page ${displaySeason}, source ${sourceSeason}`);
  const ids = new Set();
  const weeks = new Set();
  for (const game of games) {
    if (ids.has(game.id)) errors.push(`duplicate game ID: ${game.id}`); else ids.add(game.id);
    const weekKey = game.week == null ? null : `${game.phase}:${game.week}`;
    if (weekKey && weeks.has(weekKey)) errors.push(`duplicate week: ${weekKey}`); else if (weekKey) weeks.add(weekKey);
    if (game.state !== "bye" && game.isHome === null) errors.push(`impossible home/away assignment: ${game.id}`);
    if (game.timeConfirmed && !game.startsAt) errors.push(`placeholder timestamp marked confirmed: ${game.id}`);
    if (game.timeConfirmed && /T00:00:00(?:\.000)?Z$/.test(game.startsAt ?? "")) errors.push(`placeholder timestamp marked confirmed: ${game.id}`);
  }
  if (schedule?.byeWeek != null && !games.some((game) => game.state === "bye" && game.week === integer(schedule.byeWeek))) errors.push(`missing supplied bye week: ${schedule.byeWeek}`);
  const unfinished = sortSchedule(games).filter((game) => !["bye", "canceled", "completed"].includes(game.state));
  const next = nextScheduleEvent(games, new Date(0));
  if (unfinished.length && next?.id !== unfinished[0].id) errors.push(`next game skips earlier unfinished event: ${unfinished[0].id}`);
  if (schedule?.nextGameId != null && String(schedule.nextGameId) !== String(next?.id ?? "")) errors.push(`published next game skips earlier unfinished event: ${next?.id ?? "none"}`);
  if (errors.length) throw new Error(`Schedule validation failed:\n- ${errors.join("\n- ")}`);
  return true;
}

export function selectScheduleSeason(data, requestedSeason) {
  const collections = Array.isArray(data?.seasons) ? data.seasons : [data];
  const wanted = integer(requestedSeason ?? data?.season);
  const selected = collections.find((item) => integer(item?.season) === wanted);
  if (!selected) throw new Error(`Schedule season ${wanted} is unavailable.`);
  return normalizeSchedule(selected, wanted);
}

export function formatScheduleDate(game) {
  if (!game?.dateConfirmed || !game?.date) return "Date TBD";
  const value = game.startsAt ?? `${game.date}T12:00:00Z`;
  const date = new Date(value);
  const day = new Intl.DateTimeFormat("en-US", { timeZone: PACIFIC, weekday: "short", month: "short", day: "numeric" }).format(date);
  if (!game.timeConfirmed || !game.startsAt) return `${day} · Time TBD`;
  const time = new Intl.DateTimeFormat("en-US", { timeZone: PACIFIC, hour: "numeric", minute: "2-digit" }).format(date);
  return `${day} · ${time} PT`;
}

export function scheduleFreshness(updatedAt, now = new Date()) {
  const updated = new Date(updatedAt);
  if (!Number.isFinite(updated.getTime())) return { label: "Schedule update time unavailable", stale: true };
  const label = `Schedule updated ${new Intl.DateTimeFormat("en-US", { timeZone: PACIFIC, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(updated)} PT`;
  return { label, stale: now.getTime() - updated.getTime() > 72 * 60 * 60 * 1000 };
}
