import test from "node:test";
import assert from "node:assert/strict";
import {
  formatScheduleDate,
  nextScheduleEvent,
  normalizeSchedule,
  selectScheduleSeason,
  validateSchedule,
} from "../src/lib/schedule.mjs";

const SEA = { abbreviation: "SEA", full_name: "Seattle Seahawks" };
const SF = { abbreviation: "SF", full_name: "San Francisco 49ers" };
const game = (id, week, date, extra = {}) => ({ id, season: 2026, week, date, status: "Scheduled", home_team: SEA, visitor_team: SF, ...extra });

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
