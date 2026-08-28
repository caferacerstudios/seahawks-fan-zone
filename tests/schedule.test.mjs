import test from "node:test";
import assert from "node:assert/strict";
import {
  formatScheduleDate,
  formatKickoff,
  featuredScheduleEvent,
  nextScheduleEvent,
  normalizeSchedule,
  selectScheduleSeason,
  selectFeaturedGame,
  validateSchedule,
} from "../src/lib/schedule.mjs";
import { groupScheduleMonths, normalizeScheduleFilters, scheduleGameMatches, scheduleRow } from "../src/lib/schedule-display.mjs";
import { gameCalendar, gameDayView, seasonCalendar } from "../src/lib/game-day.mjs";

const SEA = { abbreviation: "SEA", full_name: "Seattle Seahawks" };
const SF = { abbreviation: "SF", full_name: "San Francisco 49ers" };
const game = (id, week, date, extra = {}) => ({ id, season: 2026, week, date, status: "Scheduled", season_type: "regular", home_team: SEA, visitor_team: SF, ...extra });

test("normalizes preseason and selects it as the next same-day event", () => {
  const schedule = normalizeSchedule({ season: 2026, games: [
    game("pre-1", 1, "2026-08-28T19:00:00Z", { season_type: "Preseason" }),
    game("reg-1", 1, "2026-09-13T20:00:00Z", { season_type: "Regular Season" }),
  ] });
  assert.equal(schedule.gamesPreseason.length, 1);
  assert.equal(nextScheduleEvent(schedule.games, new Date("2026-08-28T12:00:00Z")).id, "pre-1");
});

test("represents the missing week in a 17-game slate as a bye", () => {
  const games = Array.from({ length: 18 }, (_, index) => index + 1)
    .filter((week) => week !== 11)
    .map((week) => game(`reg-${week}`, week, `2026-${week < 5 ? "09" : week < 9 ? "10" : week < 14 ? "11" : "12"}-${String((week % 27) + 1).padStart(2, "0")}T20:00:00Z`, { season_type: "regular" }));
  const schedule = normalizeSchedule({ season: 2026, games });
  const bye = schedule.gamesRegular.find((entry) => entry.state === "bye");
  assert.deepEqual({ week: bye.week, state: bye.state, phase: bye.phase }, { week: 11, state: "bye", phase: "regular" });
});

test("does not manufacture a Week 18 kickoff time from midnight", () => {
  const schedule = normalizeSchedule({ season: 2026, games: [game("week-18", 18, "2027-01-10T00:00:00Z")] });
  const week18 = schedule.games[0];
  assert.equal(week18.timeConfirmed, false);
  assert.match(formatScheduleDate(week18), /Time TBD$/);
});

test("chooses the earliest unfinished game after completed games", () => {
  const schedule = normalizeSchedule({ season: 2026, games: [
    game("final", 1, "2026-09-01T20:00:00Z", { status: "Final" }),
    game("next", 2, "2026-09-08T20:00:00Z"),
    game("later", 3, "2026-09-15T20:00:00Z"),
  ] });
  assert.equal(nextScheduleEvent(schedule.games, new Date("2026-09-02T00:00:00Z")).id, "next");
});

test("keeps an undetermined postseason opponent and fields explicit", () => {
  const schedule = normalizeSchedule({ season: 2026, games: [{
    id: "wild-card", season: 2026, week: 1, season_type: "postseason", status: "TBD",
    home_team: SEA, visitor_team: null, date_tbd: true, time_tbd: true,
    venue_confirmed: false, network_confirmed: false, opponent_confirmed: false,
  }] });
  const playoff = schedule.gamesPostseason[0];
  assert.equal(playoff.state, "tbd");
  assert.equal(playoff.opponent, null);
  assert.equal(playoff.opponentConfirmed, false);
  assert.equal(playoff.date, null);
  assert.equal(playoff.venue, null);
  assert.equal(playoff.network, null);
});

test("switches between complete season records without mixing them", () => {
  const data = { season: 2026, seasons: [
    { season: 2025, games: [{ ...game("2025-1", 1, "2025-09-07T20:00:00Z"), season: 2025 }] },
    { season: 2026, games: [game("2026-1", 1, "2026-09-13T20:00:00Z")] },
  ] };
  assert.equal(selectScheduleSeason(data, 2025).games[0].season, 2025);
  assert.equal(selectScheduleSeason(data, 2026).games[0].season, 2026);
});

test("publishing validation rejects duplicate IDs, season mismatch, and supplied missing byes", () => {
  const valid = normalizeSchedule({ season: 2026, games: [game("one", 1, "2026-09-13T20:00:00Z")] });
  assert.equal(validateSchedule(valid, 2026), true);
  assert.throws(() => validateSchedule({ ...valid, sourceSeason: 2025 }, 2026), /season mismatch/);
  assert.throws(() => validateSchedule({ ...valid, games: [...valid.games, { ...valid.games[0] }] }, 2026), /duplicate game ID/);
  assert.throws(() => validateSchedule({ ...valid, byeWeek: 11 }, 2026), /missing supplied bye week/);
  assert.throws(() => validateSchedule({ ...valid, nextGameId: "later" }, 2026), /published next game skips/);
});

test("schedule rows expose completed scores, outcome, location, badges, and recap action", () => {
  const completed = normalizeSchedule({ season: 2026, games: [game("final", 1, "2026-09-13T20:05:00Z", {
    status: "Final", home_team: SF, visitor_team: SEA, home_team_score: 17, visitor_team_score: 24,
    network: "FOX", venue: "Levi's Stadium", prime_time: true,
  })] }).games[0];
  const row = scheduleRow(completed);
  assert.deepEqual({ state: row.state, result: row.result, location: row.homeAway, division: row.division, primeTime: row.primeTime, action: row.action }, {
    state: "completed", result: { outcome: "W", seahawks: 24, opponent: 17 }, location: "at", division: true, primeTime: true, action: "Recap",
  });
  assert.equal(row.resultLabel, "SEA 24, SF 17");
  assert.equal(row.href, "/games/final");
});

test("schedule rows distinguish next, later upcoming, TBD, and bye states", () => {
  const next = scheduleRow(normalizeSchedule({ season: 2026, games: [game("next", 2, "2026-09-20T20:05:00Z")] }).games[0], { nextGameId: "next" });
  const later = scheduleRow(normalizeSchedule({ season: 2026, games: [game("later", 3, "2026-09-27T20:05:00Z")] }).games[0]);
  const tbd = scheduleRow(normalizeSchedule({ season: 2026, games: [game("tbd", 4, "2026-10-04T00:00:00Z", { status: "TBD", time_tbd: true })] }).games[0]);
  const bye = scheduleRow({ id: "bye", state: "bye", week: 5 });
  assert.deepEqual([next.state, next.stateLabel, next.action], ["next", "Up next", "Game details"]);
  assert.deepEqual([later.state, later.stateLabel, later.action], ["upcoming", "Upcoming", "Game details"]);
  assert.deepEqual([tbd.state, tbd.stateLabel, tbd.kickoff], ["tbd", "Details TBD", "Time TBD"]);
  assert.deepEqual([bye.kind, bye.status, bye.detail], ["bye", "Bye", "No game scheduled"]);
});

test("schedule actions reflect preview, game-day, postponed, and missing metadata states", () => {
  const base = normalizeSchedule({ season: 2026, games: [game("states", 2, "2026-09-20T20:05:00Z")] }).games[0];
  assert.equal(scheduleRow({ ...base, previewAvailable: true }, { now: new Date("2026-09-19T20:00:00Z") }).action, "Preview");
  assert.equal(scheduleRow(base, { now: new Date("2026-09-20T12:00:00-07:00") }).action, "Game center");
  assert.equal(scheduleRow({ ...base, state: "postponed" }).action, "Updated details");
  const empty = scheduleRow({ ...base, network: null, venue: null });
  assert.equal(empty.network, null);
  assert.equal(empty.venue, null);
});

test("completed regular-season rows carry the Seahawks record after that game", () => {
  const schedule = normalizeSchedule({ season: 2026, games: [
    game("win", 1, "2026-09-13T20:05:00Z", { status: "Final", home_team_score: 24, visitor_team_score: 17 }),
    game("loss", 2, "2026-09-20T20:05:00Z", { status: "Final", home_team_score: 14, visitor_team_score: 21 }),
  ] });
  assert.deepEqual(schedule.games.map((entry) => entry.seahawksRecordAfter), ["1-0", "1-1"]);
});

test("bye rows stay within the surrounding chronological month group", () => {
  const september = normalizeSchedule({ season: 2026, games: [game("week-4", 4, "2026-09-27T20:05:00Z")] }).games[0];
  const october = normalizeSchedule({ season: 2026, games: [game("week-6", 6, "2026-10-11T20:05:00Z")] }).games[0];
  const groups = groupScheduleMonths([september, { id: "bye", state: "bye", week: 5 }, october]);
  assert.deepEqual(groups.map(({ label, games }) => [label, games.map(({ id }) => id)]), [
    ["September 2026", ["week-4", "bye"]], ["October 2026", ["week-6"]],
  ]);
});

test("schedule filters combine categories and OR choices within a category", () => {
  const homeDivision = normalizeSchedule({ season: 2026, games: [game("home-division", 1, "2026-09-13T20:05:00Z", { home_team: SEA, visitor_team: SF, season_type: "regular" })] }).games[0];
  const awayDivision = normalizeSchedule({ season: 2026, games: [game("away-division", 2, "2026-09-20T20:05:00Z", { home_team: SF, visitor_team: SEA, season_type: "regular" })] }).games[0];
  assert.equal(scheduleGameMatches(homeDivision, { filters: ["home", "division", "regular"] }), true);
  assert.equal(scheduleGameMatches(awayDivision, { filters: ["home", "division"] }), false);
  assert.equal(scheduleGameMatches(awayDivision, { filters: ["home", "away"] }), true);
  assert.equal(scheduleGameMatches(homeDivision, { status: "completed" }), false);
  assert.deepEqual(normalizeScheduleFilters(["HOME", "home", "invalid", "prime-time"]), ["home", "prime-time"]);
});

test("featured game stays on an unfinished live or postponed event until final", () => {
  const schedule = normalizeSchedule({ season: 2026, games: [
    game("live", 1, "2026-09-13T20:05:00Z", { status: "In Progress", home_team_score: 10, visitor_team_score: 7 }),
    game("later", 2, "2026-09-20T20:05:00Z"),
  ] });
  assert.equal(featuredScheduleEvent(schedule.games).id, "live");
  schedule.games[0].state = "completed";
  assert.equal(featuredScheduleEvent(schedule.games).id, "later");
  schedule.games[1].state = "completed";
  assert.equal(featuredScheduleEvent(schedule.games).id, "later");
});

test("canonical featured selector covers live, upcoming preseason, final, and offseason", () => {
  const schedule = normalizeSchedule({ season: 2026, games: [
    game("pre", 2, "2026-08-28T19:20:00-07:00", { season_type: "preseason" }),
    game("opener", 1, "2026-09-13T17:20:00-07:00", { season_type: "regular" }),
  ] });
  const clock = new Date("2026-08-28T12:00:00-07:00");
  assert.deepEqual(selectFeaturedGame(schedule.games, { now: clock }), { state: "upcoming", game: schedule.gamesPreseason[0], offseason: null });

  schedule.gamesRegular[0].state = "in_progress";
  assert.equal(selectFeaturedGame(schedule.games, { now: clock }).game.id, "opener");
  assert.equal(selectFeaturedGame(schedule.games, { now: clock }).state, "live");

  schedule.gamesRegular[0].state = "completed";
  schedule.gamesPreseason[0].state = "completed";
  assert.equal(selectFeaturedGame(schedule.games, { now: new Date("2026-10-01T12:00:00-07:00") }).state, "final");
  assert.equal(selectFeaturedGame([], { now: clock }).state, "offseason");
  assert.equal(selectFeaturedGame(schedule.games, { now: new Date("2027-03-01T12:00:00-08:00") }).state, "offseason");
});

test("preseason, regular-season, and postseason labels remain distinct", () => {
  for (const [seasonType, label] of [["preseason", "Preseason"], ["regular", "Regular Season"], ["postseason", "Postseason"]]) {
    const normalized = normalizeSchedule({ season: 2026, games: [game(seasonType, 1, "2026-09-13T17:20:00-07:00", { season_type: seasonType })] }).games[0];
    assert.match(gameDayView(normalized).phaseWeek, new RegExp(`^${label}`));
  }
});

test("all game surfaces preserve an exact 5:20 PM Pacific kickoff", () => {
  const normalized = normalizeSchedule({ season: 2026, games: [game("prime", 1, "2026-09-13T17:20:00-07:00")] }).games[0];
  assert.equal(formatKickoff(normalized, "time"), "5:20 PM PT");
  assert.equal(scheduleRow(normalized).kickoff, "5:20 PM PT");
  assert.equal(gameDayView(normalized).kickoff, "5:20 PM PT");
  assert.match(formatScheduleDate(normalized), /5:20 PM PT$/);
});

test("featured view cleanly omits unavailable broadcast and venue", () => {
  const normalized = normalizeSchedule({ season: 2026, games: [game("minimal", 1, "2026-09-13T17:20:00-07:00")] }).games[0];
  const view = gameDayView(normalized);
  assert.equal(view.network, null);
  assert.equal(view.venue, null);
});

test("game-day view handles today, live, final scores, phase labels, and optional metadata", () => {
  const normalized = normalizeSchedule({ season: 2026, games: [game("today", 3, "2026-08-28T20:05:00Z", {
    season_type: "Preseason", network: "KING 5", radio: "Seattle Sports 710 AM", venue: "Lumen Field",
    records: { seahawks: { phase: "preseason", record: "2-0" }, opponent: { phase: "regular", record: "10-7" } },
  })] }).games[0];
  const view = gameDayView(normalized, new Date("2026-08-28T12:00:00-07:00"));
  assert.equal(view.status, "Today");
  assert.equal(view.phaseWeek, "Preseason Week 3");
  assert.equal(view.radio, "Seattle Sports 710 AM");
  assert.equal(view.seaRecord, "2-0");
  assert.equal(view.opponentRecord, null);
  assert.equal(view.primaryLabel, "Game preview");

  normalized.state = "in_progress";
  normalized.home_team_score = 10;
  normalized.visitor_team_score = 7;
  assert.equal(gameDayView(normalized).status, "Live");
  assert.deepEqual(gameDayView(normalized).liveScore, { seahawks: 10, opponent: 7 });
  normalized.state = "completed";
  normalized.home_team_score = 24;
  normalized.visitor_team_score = 17;
  assert.deepEqual(gameDayView(normalized).result, { outcome: "W", seahawks: 24, opponent: 17 });
  assert.equal(gameDayView(normalized).primaryLabel, "Game recap");
});

test("calendar output is a complete CRLF ICS event and disables unconfirmed kickoffs", () => {
  const confirmed = normalizeSchedule({ season: 2026, games: [game("calendar-1", 1, "2026-09-13T20:05:00Z", {
    venue: "Lumen Field, Seattle", home_team: SEA, visitor_team: SF,
  })] }).games[0];
  const calendar = gameCalendar(confirmed, "https://seahawks.example/schedule/");
  assert.equal(calendar.enabled, true);
  assert.match(calendar.content, /^BEGIN:VCALENDAR\r\n/);
  assert.match(calendar.content, /X-WR-TIMEZONE:America\/Los_Angeles\r\n/);
  assert.match(calendar.content, /DTSTART:20260913T200500Z\r\n/);
  assert.match(calendar.content, /LOCATION:Lumen Field\\, Seattle\r\n/);
  assert.match(calendar.content, /URL:https:\/\/seahawks\.example\/games\/calendar-1\r\n/);
  assert.match(calendar.content, /NFL dates and times may change/);
  assert.match(calendar.content, /END:VCALENDAR\r\n$/);

  const unconfirmed = { ...confirmed, timeConfirmed: false, startsAt: null };
  assert.deepEqual(gameCalendar(unconfirmed, "https://seahawks.example").enabled, false);
});

test("season calendar has stable UIDs, all phases, date-only TBD events, and no bye event", () => {
  const schedule = normalizeSchedule({ season: 2026, games: [
    game("pre", 1, "2026-08-20T20:05:00Z", { season_type: "preseason" }),
    game("regular", 1, "2026-09-13T20:05:00Z", { season_type: "regular" }),
    { ...game("playoff", 1, "2027-01-16T00:00:00Z", { season_type: "postseason", time_tbd: true }) },
    { id: "bye", season: 2026, season_type: "regular", week: 8, status: "bye", bye: true },
  ] });
  const first = seasonCalendar(schedule, "https://seahawks.example");
  const second = seasonCalendar(schedule, "https://seahawks.example");
  assert.equal(first.eventCount, 3);
  assert.equal(first.content, second.content);
  assert.match(first.content, /UID:2026-pre@seahawksfanzone/);
  assert.match(first.content, /DTSTART;VALUE=DATE:20270116/);
  assert.doesNotMatch(first.content, /UID:2026-bye@/);
  assert.match(first.content, /URL:https:\/\/seahawks\.example\/games\/regular/);
});
