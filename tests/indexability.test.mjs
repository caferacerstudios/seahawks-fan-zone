import test from "node:test";
import assert from "node:assert/strict";
import { gameIndexability, playerIndexability, preferredPlayerId } from "../src/lib/indexability.mjs";

test("scheduled Seahawks games do not require recaps to be indexable", () => {
  const game = { id: "week-1", status: "Scheduled", date: "2026-09-13T20:25:00Z", home_team: { abbreviation: "SEA" }, visitor_team: { abbreviation: "SF" } };
  assert.equal(gameIndexability({ game, id: game.id, opponentName: "San Francisco 49ers", canonicalPath: "/games/week-1" }).indexable, true);
  assert.equal(gameIndexability({ game: { ...game, status: "Cancelled" }, id: game.id, opponentName: "San Francisco 49ers", canonicalPath: "/games/week-1" }).indexable, false);
});

test("player gate requires identity, biography, status, useful data, and the preferred alias", () => {
  const complete = { routeId: "sam-darnold", canonicalId: "sam-darnold", identity: "Sam Darnold", biography: "A substantive career biography with enough unique context to identify the player's teams, development, and professional history.", rosterStatus: "Active", usefulSections: [true] };
  assert.equal(playerIndexability(complete).indexable, true);
  assert.equal(playerIndexability({ ...complete, biography: "" }).indexable, false);
  assert.equal(playerIndexability({ ...complete, usefulSections: [] }).indexable, false);
  assert.equal(preferredPlayerId("123", "Jaxon Smith-Njigba"), "jaxon-smith-njigba");
  assert.equal(playerIndexability({ ...complete, routeId: "123", canonicalId: "jaxon-smith-njigba" }).indexable, false);
});
