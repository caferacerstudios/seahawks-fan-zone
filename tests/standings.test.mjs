import test from "node:test";
import assert from "node:assert/strict";
import { activeStandingsPhase, aggregateStandings, buildPhasedStandings, formatWinningPercentage, validateStandings } from "../src/lib/standings.mjs";
import { formatKickoff, normalizeSchedule } from "../src/lib/schedule.mjs";

const teams = [
  { id: 1, abbreviation: "SEA", full_name: "Seattle Seahawks", conference: "NFC" },
  { id: 2, abbreviation: "ARI", full_name: "Arizona Cardinals", conference: "NFC" },
  { id: 3, abbreviation: "LAR", full_name: "Los Angeles Rams", conference: "NFC" },
  { id: 4, abbreviation: "SF", full_name: "San Francisco 49ers", conference: "NFC" },
];
const game = (id, phase, date, home, away, extra = {}) => ({ id, season: 2026, week: 1, season_type: phase, date, status: "Scheduled", home_team: home, visitor_team: away, ...extra });

test("phase aggregation never mixes preseason, regular season, and postseason", () => {
  const games = [
    game("pre-1", "preseason", "2026-08-15", teams[1], teams[0], { status: "Final", home_team_score: 20, visitor_team_score: 10 }),
    game("pre-2", "preseason", "2026-08-22", teams[0], teams[2], { status: "Final", home_team_score: 13, visitor_team_score: 16 }),
    game("reg-1", "regular", "2026-09-13", teams[0], teams[3]),
    game("post-1", "postseason", "2027-01-17", teams[0], teams[1]),
  ];
  const payload = buildPhasedStandings({ season: 2026, updatedAt: "2026-08-23T12:00:00Z", games, teams });
  const preseason = payload.phases.preseason.rows.find((row) => row.abbreviation === "SEA");
  const regular = payload.phases.regular.rows.find((row) => row.abbreviation === "SEA");
  assert.deepEqual({ record: [preseason.wins, preseason.losses, preseason.ties], pf: preseason.pointsFor, pa: preseason.pointsAgainst, pct: preseason.percentage }, { record: [0, 2, 0], pf: 23, pa: 36, pct: ".000" });
  assert.deepEqual({ record: [regular.wins, regular.losses, regular.ties], rank: regular.rank }, { record: [0, 0, 0], rank: "Tied" });
  assert.equal(activeStandingsPhase(games), "preseason");
  assert.equal(validateStandings(payload, games), true);
});

test("winning percentage includes ties and has NFL formatting", () => {
  assert.equal(formatWinningPercentage(0, 2, 0), ".000");
  assert.equal(formatWinningPercentage(0, 0, 1), ".500");
  assert.equal(formatWinningPercentage(1, 0, 0), "1.000");
});

test("validation detects record, percentage, differential, phase, and duplicate corruption", () => {
  const games = [game("one", "regular", "2026-09-13", teams[0], teams[1], { status: "Final", home_team_score: 20, visitor_team_score: 10 })];
  const payload = buildPhasedStandings({ season: 2026, updatedAt: "2026-09-14T00:00:00Z", games, teams });
  const broken = structuredClone(payload);
  const sea = broken.phases.regular.rows.find((row) => row.abbreviation === "SEA");
  sea.wins = 0; sea.percentage = ".500"; sea.differential = 4;
  assert.throws(() => validateStandings(broken, games), /record does not match|percentage mismatch|point differential mismatch/);
  assert.throws(() => buildPhasedStandings({ season: 2026, updatedAt: "", games: [{ ...games[0], season_type: "mystery" }], teams }), /invalid or missing season type/i);
  assert.throws(() => validateStandings(payload, [...games, games[0]]), /duplicate game/);
});

test("date-only kickoffs preserve the Pacific calendar day and supplied kickoff time", () => {
  const cases = [
    ["2026-03-08", "1:25 PM", "Sunday, March 8, 2026 · 1:25 PM PT"],
    ["2026-09-20", "1:25 PM", "Sunday, September 20, 2026 · 1:25 PM PT"],
    ["2026-11-01", "1:25 PM", "Sunday, November 1, 2026 · 1:25 PM PT"],
    ["2027-01-10", "5:20 PM", "Sunday, January 10, 2027 · 5:20 PM PT"],
  ];
  for (const [date, status, expected] of cases) {
    const normalized = normalizeSchedule({ season: 2026, games: [game(date, "regular", date, teams[0], teams[1], { status })] }).games[0];
    assert.equal(formatKickoff(normalized), expected);
    assert.equal(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(normalized.startsAt)), date);
  }
});

test("UTC timestamps render in PDT and PST without changing their source instant", () => {
  const summer = normalizeSchedule({ season: 2026, games: [game("pdt", "regular", "2026-09-20T20:25:00Z", teams[0], teams[1])] }).games[0];
  const winter = normalizeSchedule({ season: 2026, games: [game("pst", "postseason", "2027-01-10T21:25:00Z", teams[0], teams[1])] }).games[0];
  assert.match(formatKickoff(summer), /September 20, 2026 · 1:25 PM PT$/);
  assert.match(formatKickoff(winter), /January 10, 2027 · 1:25 PM PT$/);
});
